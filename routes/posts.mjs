import { Router } from "express";
import { postValidation } from "../middlewares/post.validation.mjs";
import { connectionPool } from "../utils/db.mjs";

const postRouter = Router();

postRouter.post("/", [postValidation], async (req, res) => {
    const { title, image, category_id, description, content, status_id } = req.body;

    try {
        const query = `
        INSERT INTO posts (title, image, category_id, description, content, status_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

        const values = [title, image, category_id, description, content, status_id];
        const result = await connectionPool.query(query, values);

        return res.status(201).json({
            message: "Created post successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Server could not create post because database connection"
        });
    }
});

postRouter.get("/", async (req, res) => {
    // 1. รับค่าจาก Query Params (กำหนดค่า Default ถ้าไม่ส่งมา)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const category = req.query.category;
    const keyword = req.query.keyword;

    // คำนวณจุดเริ่มต้น (Offset)
    const offset = (page - 1) * limit;

    try {
        // 2. สร้าง SQL แบบ Dynamic (เริ่มจาก SELECT ปกติ)
        // เราต้องทำ 2 คำสั่ง: query สำหรับดึงข้อมูล และ countQuery สำหรับนับจำนวนทั้งหมด
        let query = `
                  SELECT posts.*, categories.name AS category_name
                  FROM posts
                  INNER JOIN categories
                  ON posts.category_id = categories.id
                  `;
        let countQuery = `
                  SELECT COUNT(*)
                  FROM posts
                  INNER JOIN categories ON posts.category_id = categories.id
                `;

        let values = [];        // เก็บค่าที่จะยัดใส่ $1, $2
        let conditions = [];    // เก็บเงื่อนไข WHERE

        // --- ตรวจสอบ Category ---
        if (category) {
            // สมมติว่ารับมาเป็น category_id (เพราะใน DB เก็บเป็น id)
            conditions.push(`categories.name ILIKE $${values.length + 1}`);
            values.push(category);
        }

        // --- ตรวจสอบ Keyword ---
        if (keyword) {
            // ค้นหาใน title, description หรือ content (ใช้ ILIKE เพื่อไม่สนตัวพิมพ์เล็ก-ใหญ่)
            conditions.push(`(title ILIKE $${values.length + 1} OR description ILIKE $${values.length + 1} OR content ILIKE $${values.length + 1})`);
            values.push(`%${keyword}%`); // ใส่ % หน้าหลังเพื่อค้นหาบางส่วน
        }

        // --- ประกอบร่าง WHERE clause ---
        if (conditions.length > 0) {
            const whereString = ` WHERE ${conditions.join(" AND ")}`;
            query += whereString;
            countQuery += whereString;
        }

        // 3. ยิง query หาจำนวนทั้งหมดก่อน (เพื่อเอาไปคำนวณหน้า)
        // (ใช้ values ชุดเดียวกับ query หลัก เพราะเงื่อนไขเดียวกัน)
        const countResult = await connectionPool.query(countQuery, values);
        const totalPosts = parseInt(countResult.rows[0].count);

        // 4. เติม Order, Limit, Offset ให้ query หลัก
        query += ` ORDER BY date DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

        // ใส่ค่า limit และ offset ลงไปใน values ต่อท้าย
        const queryValues = [...values, limit, offset];

        // ยิง query เอาข้อมูลจริง
        const result = await connectionPool.query(query, queryValues);

        // 5. คำนวณ Metadata เพื่อตอบกลับตามโจทย์
        const totalPages = Math.ceil(totalPosts / limit);
        const nextPage = page < totalPages ? page + 1 : null;

        // 6. ส่ง Response กลับไป
        return res.status(200).json({
            totalPosts: totalPosts,
            totalPages: totalPages,
            currentPage: page,
            limit: limit,
            posts: result.rows,
            nextPage: nextPage
        });

    } catch (error) {
        console.error(error); // แนะนำให้ log error ดูด้วย
        return res.status(500).json({
            message: "Server could not read post because database connection"
        });
    }
});

postRouter.get("/:postId", async (req, res) => {

    const { postId } = req.params;
    try {
        const result = await connectionPool.query(`
            SELECT posts.*, categories.name AS category_name
            FROM posts
            INNER JOIN categories ON posts.category_id = categories.id
            WHERE posts.id = $1`, [postId])

        if (!result.rows[0]) {
            return res.status(404).json({
                message: "Server could not find a requested post"
            })
        }

        return res.status(200).json({
            data: result.rows[0]
        })

    } catch (error) {
        return res.status(500).json({
            message: "Server could not read post because database connection"
        })
    }
})

postRouter.put("/:postId", [postValidation], async (req, res) => {

    const { postId } = req.params;
    try {
        const updatePost = {
            ...req.body,
        }

        const results = await connectionPool.query(`
        UPDATE posts 
        SET image = $2
            title = $3,
            description = $4,
            date = $5,
            content = $6,
            status_id = &7
        WHERE id = $1
        RETURNING *` ,
            [
                postId,
                updatePost.image,
                updatePost.title,
                updatePost.description,
                updatePost.date,
                updatePost.content,
                updatePost.status_id,
            ]);

        if (!results.rows[0]) {
            return res.status(404).json({
                message: "Server could not find a requested post to update"
            })
        }
        return res.status(200).json({
            message: "Updated post sucessfully"
        })

    } catch (error) {
        return res.status(500).json({
            message: "Server could not update post because database connection"
        })
    }
})

postRouter.delete("/:postId", async (req, res) => {

    const { postId } = req.params;
    try {
        const results = await connectionPool.query(`DELETE FROM posts WHERE id = $1 RETURNING *`, [postId])

        if (!results.rows[0]) {
            return res.status(404).json({
                message: "Server could not find a requested post to delete"
            })
        }
        return res.status(200).json({
            message: "Deleted post successfully"
        })

    } catch (error) {
        return res.status(500).json({
            message: "Server could not delete post because database connection"
        })
    }
})

export default postRouter
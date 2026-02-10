import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectionPool } from "./utils/db.mjs";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173", // Frontend local (Vite)
      "http://localhost:3000", // Frontend local (React แบบอื่น)
      "https://clutch-chronicles.vercel.app", // Frontend ที่ Deploy แล้ว
      // ✅ ให้เปลี่ยน https://your-frontend.vercel.app เป็น URL จริงของ Frontend ที่ deploy แล้ว
    ],
  })
);

app.get("/test", (req, res) => {
  res.send("Hello TechUp!");
});

app.get("/health", (req, res) => {
  res.status(200).json({ message: "OK" });
});

app.get("/test-db", async (req, res) => {
  try {
    // ลองสั่งให้ Database บอกเวลาปัจจุบัน (SELECT NOW)
    const result = await connectionPool.query("select now()");

    // ถ้าสำเร็จ ส่งเวลาคืนไปให้คนเรียก
    res.json({
      message: "Database connection successful! 🎉",
      time: result.rows[0].now
    });
  } catch (error) {
    // ถ้าพัง ให้ฟ้อง error ออกมา
    console.error("Database connection failed:", error);
    res.status(500).json({
      message: "Database connection failed ❌",
      error: error.message
    });
  }
});

app.get("/test-data", async (req, res) => {
  try {
    // สั่งให้ Database ส่งข้อมูลทั้งหมดในตาราง posts มาให้หน่อย
    const result = await connectionPool.query("select * from posts");

    // ส่งผลลัพธ์กลับไปให้ดู
    res.json({
      message: "ดึงข้อมูลจาก Supabase สำเร็จ! 🚀",
      data: result.rows // ตรงนี้คือเนื้อหาจริงๆ ที่อยู่ใน Database
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Database connection failed ❌" });
  }
});

app.get("/posts", async (req, res) => {
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
    let query = `SELECT * FROM posts`;
    let countQuery = `SELECT COUNT(*) FROM posts`;
    
    let values = [];        // เก็บค่าที่จะยัดใส่ $1, $2
    let conditions = [];    // เก็บเงื่อนไข WHERE

    // --- ตรวจสอบ Category ---
    if (category) {
      // สมมติว่ารับมาเป็น category_id (เพราะใน DB เก็บเป็น id)
      conditions.push(`category_id = $${values.length + 1}`);
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

app.get("/posts/:postId", async (req, res) => {

  const { postId } = req.params;
  try {
    const result = await connectionPool.query(`SELECT * FROM posts WHERE id = $1`, [postId])

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

app.put("/posts/:postId", async (req, res) => {

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
          content = $6
      WHERE id = $1
      RETURNING *` ,
      [
        postId,
        updatePost.image,
        updatePost.title,
        updatePost.description,
        updatePost.date,
        updatePost.content,
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

app.delete("/posts/:postId", async (req, res) => {

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

app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});

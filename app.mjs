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
      // สั่งให้ Database ส่งข้อมูลทั้งหมดในตาราง testing_users มาให้หน่อย
      const result = await pool.query("select * from testing_users");
  
      // ส่งผลลัพธ์กลับไปให้ดู
      res.json({
        message: "ดึงข้อมูลจาก Supabase สำเร็จ! 🚀",
        data: result.rows // ตรงนี้คือเนื้อหาจริงๆ ที่อยู่ใน Database
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/posts" , async (req,res) => {
    try {
        const results = await connectionPool.query(`SELECT * FROM posts`)
        return res.status(200).json ({
            data: results.rows
        })

    }catch (error) {
        return res.status(500).json ({
            message : "Server could not read post because database connection"
        })
    }
  })

app.listen(port, () => {
  console.log(`Server is running at ${port}`);  
});

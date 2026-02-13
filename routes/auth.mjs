import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { connectionPool } from "../utils/db.mjs";
import protectUser from "../middlewares/protectUser.mjs";
import protectAdmin from "../middlewares/protectAdmin.mjs";

// สร้างตัวแทน (Client) สำหรับคุยกับระบบ Auth ของ Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const authRouter = Router();

// 🛡️ เทส 1: ต้องล็อกอินถึงจะเห็นข้อความนี้
authRouter.get("/protected-route", protectUser, (req, res) => {
  res.json({ message: "This is protected content", user: req.user });
});

// 👑 เทส 2: ต้องเป็น admin เท่านั้นถึงจะเห็นข้อความนี้
authRouter.get("/admin-only", protectAdmin, (req, res) => {
  res.json({ message: "This is admin-only content", admin: req.user });
});

// POST /auth/register - สำหรับสมัครสมาชิกใหม่
authRouter.post("/register", async (req, res) => {
  const { email, password, username, name } = req.body;

  try {
    // 1. ตรวจสอบว่ามี username นี้ในระบบหรือยัง
    const usernameCheckQuery = `
      SELECT * FROM users
      WHERE username = $1
    `;
    const usernameCheckValues = [username];
    const { rows: existingUser } = await connectionPool.query(
      usernameCheckQuery,
      usernameCheckValues
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ error: "This username is already taken" });
    }

    // 2. สมัครสมาชิกผ่านระบบของ Supabase
    const { data, error: supabaseError } = await supabase.auth.signUp({
      email,
      password,
    });

    // จัดการ Error กรณี Supabase สมัครไม่ผ่าน (เช่น อีเมลซ้ำ หรือ รหัสผ่านสั้นไป)
    if (supabaseError) {
      if (supabaseError.code === "user_already_exists") {
        return res.status(400).json({ error: "User with this email already exists" });
      }
      return res.status(400).json({ error: "Failed to create user. Please try again." });
    }

    // 3. นำข้อมูลมาบันทึกลงตาราง users ของเรา (กำหนดให้ทุกคนที่สมัครใหม่มีสิทธิ์เป็นแค่ 'user')
    const supabaseUserId = data.user.id;
    const query = `
      INSERT INTO users (id, username, name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [supabaseUserId, username, name, "user"];
    const { rows } = await connectionPool.query(query, values);

    // ส่งผลลัพธ์กลับไปว่าสมัครสำเร็จ
    return res.status(201).json({
      message: "User created successfully",
      user: rows[0],
    });

  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "An error occurred during registration" });
  }
});

// POST /auth/login - สำหรับเข้าสู่ระบบ
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. ส่งอีเมลและรหัสผ่านไปเช็คกับ Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // 2. ถ้าเข้าสู่ระบบไม่สำเร็จ (เช่น รหัสผิด หรือไม่มีอีเมลนี้)
    if (error) {
      if (
        error.code === "invalid_credentials" ||
        error.message.includes("Invalid login credentials")
      ) {
        return res.status(400).json({
          error: "Your password is incorrect or this email doesn't exist",
        });
      }
      return res.status(400).json({ error: error.message });
    }

    // 3. ถ้าสำเร็จ ส่ง Access Token กลับไปให้ Frontend เอาไปใช้งานต่อ
    return res.status(200).json({
      message: "Signed in successfully",
      accessToken: data.session.access_token,
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "An error occurred during login" });
  }
});

// GET /auth/get-user - ดึงข้อมูลผู้ใช้ปัจจุบันจาก Token
authRouter.get("/get-user", async (req, res) => {
  // 1. ดึง Token จาก Header ที่ Frontend ส่งมา
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    // 2. เอา Token ไปถาม Supabase ว่านี่คือใคร
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      return res.status(401).json({ error: "Unauthorized or token expired" });
    }

    // 3. เอา ID ที่ได้ ไปค้นหาข้อมูลเพิ่มเติมในตาราง users ของเรา
    const supabaseUserId = data.user.id;
    const query = `
      SELECT * FROM users
      WHERE id = $1
    `;
    const values = [supabaseUserId];
    const { rows } = await connectionPool.query(query, values);

    // 4. ส่งข้อมูลทั้งหมดกลับไปให้ Frontend
    return res.status(200).json({
      id: data.user.id,
      email: data.user.email,
      username: rows[0].username,
      name: rows[0].name,
      role: rows[0].role,
      profilePic: rows[0].profile_pic,
    });
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /auth/reset-password - เปลี่ยนรหัสผ่าน
authRouter.put("/reset-password", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { oldPassword, newPassword } = req.body;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }
  if (!newPassword) {
    return res.status(400).json({ error: "New password is required" });
  }

  try {
    // 1. ดึงข้อมูล User จาก Token
    const { data: userData } = await supabase.auth.getUser(token);
    
    // 2. ลองล็อกอินด้วยรหัสผ่านเก่า เพื่อยืนยันว่าเจ้าตัวมาเปลี่ยนเองจริงๆ
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: oldPassword,
    });

    if (loginError) {
      return res.status(400).json({ error: "Invalid old password" });
    }

    // 3. ถ้ารหัสเก่าถูกต้อง ให้สั่งอัปเดตรหัสผ่านใหม่
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


export default authRouter;
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const protectUser = async (req, res, next) => {
  // ดึง Token จาก Authorization header
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    // เอา Token ไปเช็คกับ Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // ถ้าผ่าน ให้แนบข้อมูล user ไปกับ request เพื่อให้ฟังก์ชันถัดไปใช้งานต่อได้
    req.user = { ...data.user };
    next(); // 🚦 สั่งเปิดประตูให้ไปต่อได้!
    
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export default protectUser;
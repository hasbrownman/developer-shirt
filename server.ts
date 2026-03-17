import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const db = new Database("sigeon.db");

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    content TEXT,
    media_type TEXT,
    media_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT,
    user_id TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

const JWT_SECRET = process.env.JWT_SECRET || "pigeon-secret-key-123";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });
  const PORT = 3000;

  app.use(express.json());

  // Store active socket users: socketId -> user
  const activeUsers = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("register", async (data) => {
      try {
        const { username, password, color } = data;
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = Math.random().toString(36).substr(2, 9);
        
        const stmt = db.prepare("INSERT INTO users (id, username, password, color) VALUES (?, ?, ?, ?)");
        stmt.run(userId, username, hashedPassword, color);
        
        socket.emit("registerSuccess", { message: "Account created. Please login." });
      } catch (err: any) {
        socket.emit("authError", err.message.includes("UNIQUE") ? "Username already taken." : "Registration failed.");
      }
    });

    socket.on("login", async (data) => {
      try {
        const { username, password } = data;
        const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
        
        if (user && await bcrypt.compare(password, user.password)) {
          const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
          socket.emit("loginSuccess", { 
            token, 
            user: { id: user.id, username: user.username, color: user.color } 
          });
        } else {
          socket.emit("authError", "Invalid username or password.");
        }
      } catch (err) {
        socket.emit("authError", "Login failed.");
      }
    });

    socket.on("join", (userData) => {
      activeUsers.set(socket.id, userData);
      io.emit("userList", Array.from(activeUsers.values()));
      
      // Send initial data
      const posts = db.prepare(`
        SELECT posts.*, users.username, users.color 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        ORDER BY created_at DESC 
        LIMIT 50
      `).all() as any[];

      const postsWithComments = posts.map(post => {
        const comments = db.prepare(`
          SELECT comments.*, users.username, users.color 
          FROM comments 
          JOIN users ON comments.user_id = users.id 
          WHERE post_id = ? 
          ORDER BY created_at ASC
        `).all(post.id);
        return { ...post, comments };
      });

      socket.emit("postHistory", postsWithComments);
      socket.emit("systemMessage", "Welcome to SigeonView. Data is now persistent.");
    });

    socket.on("createPost", (postData) => {
      const { userId, content, media } = postData;
      const postId = Math.random().toString(36).substr(2, 9);
      
      try {
        const stmt = db.prepare("INSERT INTO posts (id, user_id, content, media_type, media_url) VALUES (?, ?, ?, ?, ?)");
        stmt.run(postId, userId, content, media?.type || null, media?.url || null);
        
        const user = db.prepare("SELECT username, color FROM users WHERE id = ?").get(userId) as any;
        const newPost = {
          id: postId,
          user_id: userId,
          username: user.username,
          color: user.color,
          content,
          media_type: media?.type,
          media_url: media?.url,
          created_at: new Date().toISOString(),
          comments: []
        };
        
        io.emit("newPost", newPost);
      } catch (err) {
        console.error("Post creation failed:", err);
      }
    });

    socket.on("createComment", (commentData) => {
      const { postId, userId, content } = commentData;
      const commentId = Math.random().toString(36).substr(2, 9);
      
      try {
        const stmt = db.prepare("INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)");
        stmt.run(commentId, postId, userId, content);
        
        const user = db.prepare("SELECT username, color FROM users WHERE id = ?").get(userId) as any;
        const newComment = {
          id: commentId,
          post_id: postId,
          user_id: userId,
          username: user.username,
          color: user.color,
          content,
          created_at: new Date().toISOString()
        };
        
        io.emit("newComment", newComment);
      } catch (err) {
        console.error("Comment creation failed:", err);
      }
    });

    socket.on("deletePost", (data) => {
      const { postId, userId } = data;
      try {
        // Verify ownership
        const post = db.prepare("SELECT user_id FROM posts WHERE id = ?").get(postId) as any;
        if (post && post.user_id === userId) {
          // Delete comments first due to FK
          db.prepare("DELETE FROM comments WHERE post_id = ?").run(postId);
          db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
          io.emit("postDeleted", postId);
        }
      } catch (err) {
        console.error("Post deletion failed:", err);
      }
    });

    socket.on("deleteComment", (data) => {
      const { commentId, userId } = data;
      try {
        // Verify ownership
        const comment = db.prepare("SELECT user_id, post_id FROM comments WHERE id = ?").get(commentId) as any;
        if (comment && comment.user_id === userId) {
          db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
          io.emit("commentDeleted", { commentId, postId: comment.post_id });
        }
      } catch (err) {
        console.error("Comment deletion failed:", err);
      }
    });

    socket.on("publicMessage", (msg) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        io.emit("publicMessage", {
          from: user,
          content: msg.content,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on("privateMessage", ({ to, content }) => {
      const fromUser = activeUsers.get(socket.id);
      if (fromUser) {
        io.to(to).emit("privateMessage", {
          from: fromUser,
          content: content,
          timestamp: new Date().toISOString(),
          isPrivate: true,
        });
        socket.emit("privateMessage", {
          from: fromUser,
          to: to,
          content: content,
          timestamp: new Date().toISOString(),
          isPrivate: true,
        });
      }
    });

    socket.on("disconnect", () => {
      activeUsers.delete(socket.id);
      io.emit("userList", Array.from(activeUsers.values()));
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

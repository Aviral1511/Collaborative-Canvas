# 🎨 Real-Time Collaborative Drawing Canvas

A **multi-user real-time drawing application** where multiple users can draw simultaneously on a shared canvas, inside isolated **rooms**, with **ghost cursors**, **global history sync**, and **per-user undo/redo**.

Built using **HTML5 Canvas + React + Node.js + Socket.io**, without using any drawing libraries (Fabric.js / Konva not used).

---

## ✅ Features

### 🖌️ Drawing

- Smooth freehand drawing using **HTML5 Canvas API**
- Accurate cursor-to-canvas coordinate mapping
- Adjustable brush **size** with `+ / -` controls
- Built-in **eraser mode**
- **Color presets** + full **color picker**

### 🌍 Collaboration (Real-Time)

- Multi-user real-time drawing in a shared canvas
- **Rooms support** (isolated drawing sessions)
- **Global state sync**: new users instantly see previous drawing
- **Ghost cursors**: view other users’ cursor positions live

### ↩️ History Controls

- **Undo**: removes only the **current user’s last stroke**
- **Redo**: restores only the **current user’s last undone stroke**
- Undo/Redo is synced across all users in the room

### 👥 User Identity

- Each user receives a **unique color** on room join
- Ghost cursors show **different colors + names**

### 🚪 Session Controls

- Join / Leave room support
- Join button disables after joining to avoid confusion
- Clear room canvas sync across all users

---

## 🛠 Tech Stack

### Frontend

- **React.js (Vite)**
- **Tailwind CSS**
- HTML5 Canvas (`getContext("2d")`)

### Backend

- **Node.js**
- **Express.js**
- **Socket.io**
- `type: "module"` enabled

---

## 📂 Project Structure

```bash
collaborative-canvas/
├── client/                      # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   └── CanvasBoard.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
│
├── server/                      # Node.js backend
│   ├── server.js
│   └── package.json
│
├── README.md
└── ARCHITECTURE.md
```

## 📸 Screenshots

<img width="1834" height="965" alt="Screenshot 2026-01-30 162511" src="https://github.com/user-attachments/assets/8e1c56cf-a2b3-4fa7-b84a-68b0f3c91db5" />

## ✅ Setup & Run Locally

### 1️⃣ Clone the repository

```bash
git clone https://github.com/Aviral1511/Collaborative-Canvas.git
```

2️⃣ Start Backend (Server)

```bash
cd server
npm install
npm run dev
```

3️⃣ Start Frontend (Client)
Open a new terminal:

```bash
cd client
npm install
npm run dev
```

## ✅ How to Use

### ✅ Join a Room

- Enter a Room ID
- Click Join

**Share the same Room ID with others to collaborate**

✅ Use Leave Room to exit and switch rooms.

## ✅ How to Test (Quick Checklist)

### ✅ Real-time Collaboration

- Open the app in two tabs/windows
- Join the same Room ID
- Draw in one tab → it should appear in the other instantly ✅

### ✅ Global History Sync

- Draw something in Tab A
- Open Tab B and join the same room
- Tab B should load the full existing drawing automatically ✅

### ✅ Ghost Cursors

- Move cursor in Tab A
- Cursor indicator should be visible in Tab B ✅
- Each user has a unique color + label ✅

### ✅ Undo / Redo (Per-user)

- Draw 2 strokes in Tab A
- Draw 1 stroke in Tab B
- Click Undo in Tab A → only Tab A last stroke is removed ✅
- Click Redo in Tab A → only Tab A undone stroke is restored ✅

## ⚠️ Known Limitations / Notes

- This project uses an in-memory server state (`roomStrokes`, redo stacks). If the backend restarts, the room drawing state resets.
- Stroke history size is not permanently stored in a database (intentionally kept simple for this assignment).
- Undo/Redo is **per-user** but synchronized globally (i.e., everyone sees the updated canvas state after undo/redo).

## ⏱️ Time Spent

- Approx. **9-11 hours** (including implementation, debugging, and testing across multiple windows)

## 🌐 Deployment

### ✅ This project is deployed and can be tested live using the hosted links.

#### Link :

## 📄 Documentation

- ✅ ARCHITECTURE.md is included in the repository for detailed technical design.

## 📬 Author

- **Name - Aviral Tiwari**
- Contact: aviral.legend520@gmail.com
- Linkedin - https://www.linkedin.com/in/aviral-tiwari-78620524b/

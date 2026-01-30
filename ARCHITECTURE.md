# 🏗️ ARCHITECTURE.md — Real-Time Collaborative Drawing Canvas

This document explains the architecture and real-time synchronization logic used in this project.

---

## 🎯 Goal

Build a **real-time multi-user drawing canvas** where users can:

- Draw together inside **rooms**
- See **ghost cursors**
- Get **global history sync** on join
- Use **per-user Undo / Redo** without affecting others

---

## 🧩 High-Level Architecture

### ✅ Client (React)

Responsible for:

- Canvas rendering using `HTML5 Canvas API`
- Capturing pointer/mouse events
- Emitting real-time drawing data to server
- Rendering remote updates from other users
- Overlaying ghost cursors and labels

### ✅ Server (Node + Socket.io)

Responsible for:

- Room-based isolation (`socket.join(roomId)`)
- Maintaining global room drawing state (strokes)
- Broadcasting drawing updates to other users in the same room
- Handling per-user Undo/Redo logic
- Assigning unique user colors + labels

---

## 📦 Data Model (Server State)

### ✅ Stroke Format

Each drawing action is stored as a **stroke** (not pixel-level state):

```js
{
  id: "strokeId",
  userId: "socketId",
  points: [{ x, y }, { x, y }, ...],
  style: { color, width },
  ts: 1700000000000
}
```

### ✅ Room State

```js
roomStrokes: Map<roomId, stroke[]>
```

### ✅ Redo State (Per User)

```js
roomRedo: Map<roomId, Map<userId, stroke[]>>
```

### ✅ User Identity (Color + Name)

```js
roomUsers: Map<roomId, Map<userId, { name, color }>>
```

## 🔁 Real-Time Sync Flow

### ✅ 1) User joins a room

### Client emits:

```js
join_room({ roomId });
```

### Server:

- joins socket to room
- assigns unique color + name
- sends full room strokes using room_state

### Client receives:

```js
room_state({ roomId, strokes });
```

#### ✅ Client clears the canvas and replays strokes to match server state.

### ✅ 2) Drawing flow (Realtime)

Stroke Start

Client emits:

```js
stroke_start({ roomId, strokeId, point, style });
```

Server:

- creates new stroke in roomStrokes
- broadcasts to others in same room
- Stroke Points

Client emits:

```js
stroke_add({ roomId, strokeId, point });
```

Server:

- appends point to that stroke
- broadcasts point to others

✅ Clients render remote strokes smoothly in real-time.

### 👻 Ghost Cursors

Client emits:

```js
cursor_move({ roomId, x, y });
```

Server broadcasts to room:

```js
cursor_move({ userId, x, y });
```

✅ Client shows a cursor dot + label using overlay UI (not drawn on canvas).

## ↩️ Undo / Redo Design

### ✅ Undo (Per-user)

When a user clicks Undo:

- server finds the last stroke created by that user
- removes it from the global strokes list
- stores it in that user’s redo stack
- broadcasts fresh global state using room_state

#### ✅ This ensures only that user’s stroke is removed.

### ✅ Redo (Per-user)

When a user clicks Redo:

- server restores the latest undone stroke from the user redo stack
- pushes it back into global strokes
- broadcasts updated state using room_state

#### ✅ Redo only restores your own undone strokes.

### 🧹 Clear Canvas

Client emits:

```js
clear_canvas({ roomId });
```

Server:

- clears room strokes
- clears redo state
- broadcasts updated empty room_state

## ✅ Key Design Choices

#### ✅ Server is the source of truth

The server maintains the correct room drawing state.
Clients receive and replay room_state whenever needed (join/undo/redo/clear).

#### ✅ Stroke replay instead of pixel undo

Undo/Redo is done by removing strokes and replaying everything, which is:

- stable
- conflict-safe
- predictable across clients

---

## 🔄 Data Flow Diagram (Real-Time Sync)

```mermaid
flowchart LR

A[User A (Client)] -->|Join Room| S[Server (Socket.io)]
S -->|room_state (history)| B[User B (Client)]

A -->|Pointer Move / Draw| S
S -->|stroke_start / stroke_add| B
B -->|Render stroke live| B

A -->|Cursor Move| S
S -->|cursor_move broadcast| B
B -->|Render ghost cursor| B

A -->|Undo / Redo| S
S -->|room_state (replay)| B

A -->|Clear Canvas| S
S -->|room_state (empty)| B
```

## ✅ Summary

This architecture provides:

- Real-time collaboration inside rooms ✅
- Global state sync for new users ✅
- Smooth multi-user experience ✅
- Per-user Undo/Redo without affecting others ✅
- Ghost cursors with unique color + labels ✅

```

```

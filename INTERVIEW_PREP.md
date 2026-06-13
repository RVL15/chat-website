# 🎤 AeroChat - Interview Preparation Guide

This document is designed to help you explain the **AeroChat** project to technical interviewers. It breaks down the architecture, the "why" behind your technology choices, how specific features were implemented in the code, and how to talk about the challenges you solved.

---

## 1. The Elevator Pitch (What is this project?)
**What to say:**
> *"AeroChat is a real-time, full-stack messaging application I built from scratch. It supports 1-on-1 messaging, group chats, real-time read receipts, and multimedia sharing. I also integrated WebRTC to enable peer-to-peer audio and video calling. I chose to build the frontend entirely in Vanilla HTML, CSS, and JavaScript to deeply understand DOM manipulation and state management without relying on frameworks like React. The backend is powered by Node.js, Express, and Socket.io, with MongoDB handling the data persistence."*

---

## 2. Explaining the Tech Stack & Architecture

### **Frontend: Vanilla HTML, CSS, & JavaScript**
**Interviewer Question:** *"Why didn't you use React or Angular?"*
**Your Answer:**
> *"I wanted to demonstrate a strong foundational knowledge of JavaScript and the DOM. By avoiding frameworks, I had to architect my own state management system (using global variables like `cachedConversations` and `activeChatId`) and manually handle UI updates efficiently using `document.createElement()` to prevent XSS vulnerabilities. It taught me exactly what frameworks do under the hood."*

**Key Code Areas to Mention:**
- **Dynamic Rendering:** Mention the `renderConversations()` and `appendMessage()` functions in `app.js`. Explain how you build DOM nodes in memory before appending them to the document to keep the app fast and secure.
- **CSS Variables:** Mention how you implemented Dark/Light mode instantly by toggling a `.light-mode` class on the root element, which reassigns native CSS variables (`var(--bg-primary)`).

### **Backend: Node.js & Express**
**Interviewer Question:** *"How is your backend structured?"*
**Your Answer:**
> *"I used Express to handle traditional REST API endpoints for authentication (Register, Login, Reset Password). For real-time data, I attached a Socket.io server to the same HTTP server instance. This allowed me to handle both static file serving, standard API requests, and WebSocket connections on a single port."*

### **Database: MongoDB & Mongoose**
**Interviewer Question:** *"Why MongoDB instead of SQL?"*
**Your Answer:**
> *"Chat applications naturally generate unstructured, nested data. For instance, a single message might have an array of reaction objects or a media file attachment. MongoDB's document model handles this perfectly. I used Mongoose to enforce schemas (like `User`, `Message`, and `Chat`) to ensure data integrity."*

---

## 3. Explaining Key Features & The Code Behind Them

### A. Real-Time Messaging & Read Receipts
**How it works in the code:**
When a user clicks "Send", `app.js` captures the text and emits a `chat-message` event to the server. 
On the backend (`server.js`), the server intercepts this event, saves the message to MongoDB, and then uses `io.to(chatId).emit('new-message')` to broadcast it to everyone in that specific chat room.
**For Read Receipts:** When the recipient's client receives the message, it immediately emits a `mark-read` event back to the server. The server updates the database and emits a `message-status-update` back to the sender, which triggers the UI to change the grey ticks into **Blue Ticks**.

### B. Multimedia Uploads via WebSockets
**How it works in the code:**
Instead of using a traditional `multipart/form-data` API endpoint (like `multer`), you optimized the app for speed.
When a user attaches an image, the frontend uses the native `FileReader` API (`reader.readAsDataURL()`) to convert the file into a **Base64 string**. This string is attached directly to the Socket.io payload. 
> *Tip to mention:* "By default, Socket.io restricts payloads to 1MB. I had to manually configure the server with `maxHttpBufferSize: 5e6` to allow payloads up to 5MB, which completely eliminated the need for a separate upload server!"

### C. WebRTC Peer-to-Peer Video/Audio Calling
**How it works in the code:**
This is the most technically complex part of the app. Explain it in three steps:
1. **Accessing Hardware:** The frontend uses `navigator.mediaDevices.getUserMedia({ video: true, audio: true })` to get the local camera and microphone stream.
2. **Signaling Server:** WebRTC is peer-to-peer, but the browsers need to find each other first. You used the existing Socket.io server as a "Signaling Server" to bounce `SDP Offers`, `SDP Answers`, and `ICE Candidates` between the Caller and the Receiver.
3. **The Connection:** Once the handshake is complete, the `RTCPeerConnection` object routes the video data directly between the two users via UDP, bypassing your Node.js server entirely to save bandwidth.

---

## 4. Technical Challenges You Overcame (Great for Behavioral Questions)

**Challenge 1: Video Call Hardware Locks during Local Testing**
> *"When testing video calls between two browser tabs on the same computer, the first tab would lock the webcam hardware, causing the second tab to crash when it tried to answer the call. To fix this, I engineered a `createDummyStream()` function. If the webcam fails to load, the app automatically generates an HTML5 `<canvas>`, draws an animated ticking clock on it, and captures it as a video stream using `canvas.captureStream(30)`. This allowed me to test complex WebRTC networking locally without hardware conflicts!"*

**Challenge 2: Securing the WebSockets**
> *"A common mistake is securing the REST API but leaving WebSockets open. To solve this, when a user logs in, the Express API gives them a JSON Web Token (JWT). When the frontend opens the Socket.io connection, it passes that token in the connection handshake (`auth: { token }`). The server uses a middleware (`io.use`) to verify the JWT signature before allowing the socket connection, ensuring absolute security."*

**Challenge 3: Managing 'Active' Chat State**
> *"When a user receives a new message, how does the app know whether to show a push notification or immediately mark it as read? I managed this by tracking an `activeChatId` variable on the client. If the incoming message's `chatId` matches the `activeChatId`, it means the user is looking at the chat, so it marks it read instantly. If it doesn't match, it increments a notification badge in the sidebar."*

---

## 5. Summary Cheat Sheet for the Interview

If they ask:
- **"What was the hardest part?"** $\rightarrow$ Explain WebRTC Signaling and the Dummy Stream fallback.
- **"How did you handle state?"** $\rightarrow$ Vanilla JS variables (`cachedConversations`) and DOM reconstruction.
- **"How is it secure?"** $\rightarrow$ JWTs on both the REST API and the Socket Handshake, plus `bcrypt` for passwords.
- **"How does the database scale?"** $\rightarrow$ MongoDB handles the high-volume unstructured message data natively. Mongoose provides the strict schema validation.

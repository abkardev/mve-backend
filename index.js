// import express from "express";
// import dotenv from "dotenv";
// import { dbConnect } from "./src/utils/utils.js";
// import helmet from "helmet";
// import morgan from "morgan";
// import cors from "cors"
// import { errorHandler, notFoundErrorHandler } from "./src/middlewares/errorHandler.js";
// import userRouter from "./src/routes/userRoutes.js";
// import vendorRouter from "./src/routes/vendorRoutes.js";
// import productRouter from "./src/routes/productRoutes.js";
// import brandRouter from "./src/routes/brandRoutes.js";
// import categoryRouter from "./src/routes/categoryRoutes.js";
// import subcategoryRouter from "./src/routes/subCategoryRoutes.js";
// import wishlistRouter from "./src/routes/wishlistRoutes.js";
// import reviewRouter from "./src/routes/reviewRoutes.js";
// import uploadRouter from "./src/routes/uploadRoutes.js";
// import orderRouter from "./src/routes/orderRoutes.js";
// import supportRouter from "./src/routes/supportRoutes.js";

// // Load Environment Variables from .env file
// dotenv.config();

// //connection to MongoDB
// dbConnect();

// // Initialize Express App
// const app = express();

// //Middleware Setup
// app.use(helmet());
// app.use(express.json());
// app.use(morgan("dev"));
// app.use(cors());

// // Api Routes
// app.use("/api/user", userRouter);
// app.use("/api/vendor", vendorRouter);
// app.use("/api/product", productRouter);
// app.use("/api/brand", brandRouter);
// app.use("/api/category", categoryRouter);
// app.use("/api/subcategory", subcategoryRouter);
// app.use("/api/wishlist", wishlistRouter);
// app.use("/api/review", reviewRouter);
// app.use("/api/upload", uploadRouter);
// app.use("/api/order", orderRouter);
// app.use("/api/support", supportRouter);





// // Error Handler Middlewares
// app.use(notFoundErrorHandler);
// app.use(errorHandler);

// // Starting the server
// const PORT = process.env.PORT || 8000;
// app.listen(PORT, () => {
//     console.log(`Server is running at http://localhost:${PORT}`);
// });
import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { dbConnect } from "./src/utils/utils.js";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import { errorHandler, notFoundErrorHandler } from "./src/middlewares/errorHandler.js";

// Import routes
import userRouter from "./src/routes/userRoutes.js";
import vendorRouter from "./src/routes/vendorRoutes.js";
import productRouter from "./src/routes/productRoutes.js";
import brandRouter from "./src/routes/brandRoutes.js";
import categoryRouter from "./src/routes/categoryRoutes.js";
import subcategoryRouter from "./src/routes/subCategoryRoutes.js";
import wishlistRouter from "./src/routes/wishlistRoutes.js";
import reviewRouter from "./src/routes/reviewRoutes.js";
import uploadRouter from "./src/routes/uploadRoutes.js";
import orderRouter from "./src/routes/orderRoutes.js";
import supportRouter from "./src/routes/supportRoutes.js";
import chatRouter from "./src/routes/chatRoutes.js";
import announcementRouter from "./src/routes/announcementRoutes.js";

// Import socket handler
import { setupChatSocket } from "./src/sockets/chat.socket.js";

// Load Environment Variables
dotenv.config();

// Connect to MongoDB
dbConnect();

// Initialize Express App
const app = express();

// Create HTTP Server for Socket.io
const httpServer = createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Setup Socket.io handlers
setupChatSocket(io);
const escrowRoutes = require('./routes/escrowRoutes');
const stripeWebhook = require('./webhooks/stripeWebhook');
const cron = require('node-cron');
const escrowAutoRelease = require('./jobs/escrowAutoRelease');
cron.schedule('0 * * * *', escrowAutoRelease);



// Middleware Setup
app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));
app.use(cors());



// API Routes
app.use("/api/user", userRouter);
app.use("/api/vendor", vendorRouter);
app.use("/api/product", productRouter);
app.use("/api/brand", brandRouter);
app.use("/api/category", categoryRouter);
app.use("/api/subcategory", subcategoryRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/review", reviewRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/order", orderRouter);
app.use("/api/support", supportRouter);
app.use("/api/chat", chatRouter);
app.use("/api/announcement", announcementRouter);
app.use('/api', escrowRoutes);
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);



// Error Handler Middlewares
app.use(notFoundErrorHandler);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Socket.io is ready for connections`);
});

export { io };

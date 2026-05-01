import { Message } from "../models/messageModel.js";
import { Chat } from "../models/chatModel.js";

export const setupChatSocket = (io) => {
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        // Join user's chat rooms
        socket.on("join_chat", (chatId) => {
            socket.join(chatId);
            console.log(`User ${socket.id} joined chat ${chatId}`);
        });

        // Leave chat room
        socket.on("leave_chat", (chatId) => {
            socket.leave(chatId);
        });

        // Handle new message
        socket.on("send_message", async (data) => {
            try {
                const { chatId, senderId, content, attachments } = data;

                // Save message to database
                const message = await Message.create({
                    chat: chatId,
                    sender: senderId,
                    content,
                    attachments
                });

                // Update chat's last message
                await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

                // Populate sender info
                await message.populate("sender", "name email");

                // Broadcast to all users in chat room
                io.to(chatId).emit("receive_message", message);

            } catch (error) {
                socket.emit("message_error", { error: error.message });
            }
        });

        // Typing indicators
        socket.on("typing", (data) => {
            socket.to(data.chatId).emit("user_typing", {
                userId: data.userId,
                userName: data.userName
            });
        });

        socket.on("stop_typing", (data) => {
            socket.to(data.chatId).emit("user_stop_typing", {
                userId: data.userId
            });
        });

        // Mark messages as read
        socket.on("mark_read", async (data) => {
            await Message.updateMany(
                { chat: data.chatId, sender: { $ne: data.userId }, isRead: false },
                { isRead: true }
            );
            socket.to(data.chatId).emit("messages_read", { chatId: data.chatId, userId: data.userId });
        });

        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);
        });
    });
};

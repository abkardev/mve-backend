import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    title: {
        en: { type: String, required: true },
        ar: String
    },
    description: {
        en: { type: String, required: true },
        ar: String
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
    },
    quantity: {
        type: Number,
        required: true
    },
    unit: String,
    budget: {
        min: Number,
        max: Number,
        currency: { type: String, default: "USD" }
    },
    deadline: Date,
    attachments: [String],
    status: {
        type: String,
        enum: ["open", "in_progress", "closed", "expired"],
        default: "open"
    },
    responses: [{
        vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
        message: String,
        quotedPrice: Number,
        respondedAt: { type: Date, default: Date.now }
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

export const Announcement = mongoose.model("Announcement", announcementSchema);

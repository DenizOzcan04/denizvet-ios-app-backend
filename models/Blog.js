import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    excerpt: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String, 
      required: false,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    readTime: {
      type: Number, 
      default: 5,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Blog", blogSchema);

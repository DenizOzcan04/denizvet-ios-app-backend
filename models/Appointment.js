import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, 
    },

    vet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", 
      default: null,
    },

    petType: {
      type: String,
      required: true,
    },

    petName: {
      type: String,
      required: true,
    },

    serviceType: {
      type: String,
      required: true,
    },

    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },

    date: {
      type: String,
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "completed", "cancelled", "cancel_requested"],
      default: "active",
    },

    cancelReason: {
      type: String,
      default: "",
    },

    cancelRequestedAt: {
      type: Date,
      default: null,
    },

    cancelRequestStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);

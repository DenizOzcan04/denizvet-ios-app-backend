import mongoose from "mongoose";

const clinicClosedSlotSchema = new mongoose.Schema(
  {
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    closedTimes: {
      type: [String],
      default: [],
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

clinicClosedSlotSchema.index({ clinic: 1, date: 1 }, { unique: true });

export default mongoose.model("ClinicClosedSlot", clinicClosedSlotSchema);

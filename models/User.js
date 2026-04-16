import mongoose from "mongoose";

const userSchema = new mongoose.Schema ({
    name : { type: String, required: true},
    surname : { type: String, required: true},
    phone : { type: String, required: true},
    username: {
        type: String,
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true,
    },
    passwordHash : {type: String, required: true},
    role: {type: String, enum: ["user", "vet", "admin"], default: "user"},
    clinic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Clinic",
        default: null,
    },
    
}, { timestamps: true});


export default mongoose.model("User", userSchema);

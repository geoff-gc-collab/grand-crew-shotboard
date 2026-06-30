import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req) {
  const form = await req.formData();
  const file = form.get("file");
  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(base64, {
      folder: "grand-crew-shotboard",
      resource_type: "image",
    });
    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
    });
  } catch (err) {
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}

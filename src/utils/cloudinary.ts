import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

export async function uploadAudio(base64Data: string): Promise<string> {
  const result = await cloudinary.uploader.upload(
    `data:audio/m4a;base64,${base64Data}`,
    {
      resource_type: "video", // Cloudinary uses "video" for audio files
      folder: "muraqib/recitations",
      format: "m4a",
    },
  );
  return result.secure_url;
}

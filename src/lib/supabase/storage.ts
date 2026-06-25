import { createClient } from "./server";

const bucketName = "restaurant-assets";

function extensionFromFile(file: File) {
  const nameExtension = file.name.split(".").pop();
  if (nameExtension) {
    return nameExtension.toLowerCase();
  }

  return file.type.split("/").pop() || "bin";
}

export async function uploadPublicImage(file: File | null, folder: string) {
  if (!file || file.size === 0) {
    return null;
  }

  const supabase = await createClient();
  const extension = extensionFromFile(file);
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucketName).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data.publicUrl;
}

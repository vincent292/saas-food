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

async function listStoragePaths(folder: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucketName).list(folder, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error || !data?.length) {
    return [];
  }

  const paths: string[] = [];

  for (const entry of data as Array<{ name: string; id?: string | null; metadata?: unknown }>) {
    const path = `${folder}/${entry.name}`;
    if (entry.id || entry.metadata) {
      paths.push(path);
    } else {
      paths.push(...(await listStoragePaths(path)));
    }
  }

  return paths;
}

export async function deleteRestaurantAssets(restaurantId: string, slug: string) {
  const supabase = await createClient();
  const prefixes = Array.from(new Set([`restaurants/${restaurantId}`, `restaurants/${slug}`]));
  const paths = (await Promise.all(prefixes.map((prefix) => listStoragePaths(prefix)))).flat();

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    if (chunk.length) {
      await supabase.storage.from(bucketName).remove(chunk);
    }
  }
}

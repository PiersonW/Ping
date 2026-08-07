import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../supabase";

async function uploadImage(localUri: string, pathPrefix: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const rawExt = localUri.split(".").pop()?.toLowerCase() || "jpg";
  const ext = rawExt === "jpg" ? "jpeg" : rawExt;
  const path = `${pathPrefix}.${ext === "jpeg" ? "jpg" : ext}`;

  const { error } = await supabase.storage
    .from("event-images")
    .upload(path, decode(base64), {
      contentType: `image/${ext}`,
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("event-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadEventImage(
  localUri: string,
  ownerId: string,
): Promise<string> {
  return uploadImage(localUri, `${ownerId}/${Date.now()}`);
}

// Reuses the same bucket as event photos, under its own prefix, so no
// separate storage bucket needs to be provisioned for avatars.
export async function uploadAvatarImage(
  localUri: string,
  userId: string,
): Promise<string> {
  return uploadImage(localUri, `avatars/${userId}/${Date.now()}`);
}

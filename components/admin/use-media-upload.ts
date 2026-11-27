import { useMutation } from "convex/react";
import { mediaApi } from "./convex-api";

export function useMediaUpload() {
  const generateUploadUrl = useMutation(mediaApi.generateUploadUrl);
  const finalizeUpload = useMutation(mediaApi.finalizeUpload);
  return async (file: File, alt: string, targetFolder: string) => {
    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error(`Storage upload failed (${response.status}).`);
    const payload = (await response.json()) as { storageId?: string };
    if (!payload.storageId) throw new Error("Storage did not return a file identifier.");
    await finalizeUpload({
      storageId: payload.storageId,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      ...(alt.trim() ? { alt: alt.trim() } : {}),
      ...(targetFolder.trim() ? { folder: targetFolder.trim() } : {}),
    });
    return payload.storageId;
  };
}

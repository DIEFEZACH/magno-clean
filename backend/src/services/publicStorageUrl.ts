function encodedStoragePath(storagePath: string) {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

export function publicStorageObjectUrl(supabaseUrl: string, bucket: string, storagePath: string) {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedStoragePath(storagePath)}`;
}

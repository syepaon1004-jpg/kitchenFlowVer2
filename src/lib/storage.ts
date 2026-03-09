import { supabase } from './supabase';

const BUCKET = 'assets';

/**
 * 파일을 Supabase Storage assets 버킷에 업로드하고 public URL을 반환한다.
 * 파일명: {folder}/{timestamp}_{sanitized_name}
 */
export async function uploadToStorage(
  file: File,
  folder: string,
): Promise<string> {
  // 파일명을 영문 소문자 + 언더스코어로 정리
  const sanitized = file.name
    .toLowerCase()
    .replace(/\.[^.]+$/, '') // 확장자 제거
    .replace(/[^a-z0-9]/g, '_') // 영문 소문자/숫자 외 → 언더스코어
    .replace(/_+/g, '_') // 연속 언더스코어 정리
    .replace(/^_|_$/g, ''); // 앞뒤 언더스코어 제거

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const timestamp = Date.now();
  const path = `${folder}/${timestamp}_${sanitized}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) {
    throw new Error(`업로드 실패: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

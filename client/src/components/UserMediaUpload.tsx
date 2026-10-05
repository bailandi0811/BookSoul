import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCw, Upload, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore, type UploadStage } from "@/store/useUserProfileStore";
import { ProfileApiError, WALLPAPER_LIMIT, validateMediaFile, type MediaPurpose, type ProfileSnapshot, type UploadTicket } from "@/lib/user-profile-api";

type Props = { purpose: MediaPurpose; onCommitted: (profile: ProfileSnapshot) => void };
export function UserMediaUpload(props: Props) {
  const userId = useAuthStore(state => state.user?.id);
  const generation = useAuthStore(state => state.authGeneration);
  if (!userId) return null;
  return <UploadControl key={`${userId}:${generation}`} {...props} />;
}
function UploadControl({ purpose, onCommitted }: Props) {
  const profile = useUserProfileStore(state => state.profile);
  const saving = useUserProfileStore(state => state.saving);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const ticket = useRef<UploadTicket | null>(null);
  const uploaded = useRef(false);
  const unavailable = !profile?.mediaUploadsAvailable || (purpose === "WALLPAPER" && profile.wallpapers.length >= WALLPAPER_LIMIT);
  const canRetryCommit = uploaded.current && ticket.current !== null;
  function releasePreview() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null; setPreview(null);
  }
  useEffect(() => () => {
    controller.current?.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);
  function cancel() {
    controller.current?.abort(); controller.current = null;
    releasePreview(); setFile(null); setStage(null); setError(null);
    ticket.current = null; uploaded.current = false;
    if (input.current) input.current.value = "";
  }
  async function upload() {
    if (!file || stage || saving || (unavailable && !canRetryCommit)) return;
    const request = new AbortController(); controller.current = request;
    setError(null); setSuccess(false); setPercent(0);
    try {
      let saved: ProfileSnapshot;
      // The server can acknowledge an already committed ID even after its upload window.
      if (uploaded.current && ticket.current) {
        setStage("validating");
        saved = await useUserProfileStore.getState().commitMedia(ticket.current.assetId, request.signal);
      } else {
        ticket.current = null; uploaded.current = false;
        saved = await useUserProfileStore.getState().uploadMedia(file, purpose, {
          signal: request.signal,
          onTicket: value => { ticket.current = value; },
          onProgress: progress => setPercent(progress.percent),
          onStage: value => { setStage(value); if (value === "validating") uploaded.current = true; },
        });
      }
      request.signal.throwIfAborted();
      releasePreview(); setFile(null); setSuccess(true); ticket.current = null; uploaded.current = false;
      onCommitted(saved);
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof ProfileApiError && ["MEDIA_NOT_UPLOADED", "MEDIA_UPLOAD_EXPIRED", "MEDIA_INVALID_IMAGE", "MEDIA_TOO_LARGE"].includes(error.code ?? "")) uploaded.current = false;
      setError(error instanceof ProfileApiError && error.code === "PROFILE_REVISION_CONFLICT"
        ? "资料已在其他设备修改，请核对后重试确认。"
        : error instanceof Error ? error.message : "上传失败，请重试");
    } finally { if (controller.current === request) { controller.current = null; setStage(null); } }
  }
  return <div className={`user-media-upload user-media-${purpose.toLowerCase()}`}>
    <input ref={input} type="file" className="sr-only" aria-label={purpose === "AVATAR" ? "选择头像文件" : "选择壁纸文件"}
      accept="image/jpeg,image/png,image/webp" disabled={Boolean(stage) || saving || unavailable}
      onChange={event => {
        const next = event.target.files?.[0]; event.target.value = "";
        if (!next) return;
        releasePreview(); setError(null); setSuccess(false); ticket.current = null; uploaded.current = false;
        const invalid = validateMediaFile(next, purpose);
        if (invalid) { setFile(null); setError(invalid); return; }
        const url = URL.createObjectURL(next); previewRef.current = url; setPreview(url); setFile(next);
      }} />
    <button type="button" className="account-text-button" disabled={Boolean(stage) || saving || unavailable} onClick={() => input.current?.click()}><ImagePlus size={14} />{purpose === "AVATAR" ? "更换头像" : "上传壁纸"}</button>
    {unavailable && <p className="media-availability" role="status">{profile?.mediaUploadsAvailable ? `图库已满（最多 ${WALLPAPER_LIMIT} 张）` : "图片上传暂不可用"}</p>}
    {preview && <div className="media-preview-row">
      <img className="media-preview" src={preview} alt={purpose === "AVATAR" ? "头像预览" : "壁纸预览"} />
      <div className="media-preview-actions">
        {stage ? <div role="status">{stage === "signing" ? "正在准备上传…" : stage === "uploading" ? `正在上传 ${percent}%` : "正在验证图片…"}
          {stage === "uploading" && <progress max={100} value={percent} aria-label="图片上传进度" />}
        </div> : <button type="button" className="account-text-button" aria-label="确认上传" disabled={saving || (unavailable && !canRetryCommit)} onClick={() => void upload()}>{error ? <RotateCw size={14} /> : <Upload size={14} />}{error ? uploaded.current ? "重试确认" : "重试上传" : "确认上传"}</button>}
        <button type="button" className="account-text-button" aria-label="取消上传" onClick={cancel}><X size={14} />取消</button>
      </div>
    </div>}
    {error && <p role="alert" className="profile-error">{error}</p>}
    {success && <p role="status" className="media-availability">已保存</p>}
  </div>;
}

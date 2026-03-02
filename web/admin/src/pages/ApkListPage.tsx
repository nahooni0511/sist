import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import { ApkItem } from "../types/admin";

export default function ApkListPage() {
  const { api } = useAppContext();

  const [apks, setApks] = useState<ApkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [packageFilter, setPackageFilter] = useState("");
  const [latestOnly, setLatestOnly] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [uploadPackageName, setUploadPackageName] = useState("");
  const [uploadVersionName, setUploadVersionName] = useState("");
  const [uploadVersionCode, setUploadVersionCode] = useState("");
  const [uploadReleaseNote, setUploadReleaseNote] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lastUploaded, setLastUploaded] = useState<ApkItem | null>(null);

  const loadApks = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const list = await api.listApks({
        query: query.trim() || undefined,
        packageName: packageFilter.trim() || undefined,
        latestOnly
      });
      setApks(list.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)));
    } catch (err) {
      setError((err as Error).message || "APK 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, latestOnly, packageFilter, query]);

  useEffect(() => {
    void loadApks();
  }, [loadApks]);

  async function onUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("업로드할 .apk 파일을 선택하세요.");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      setError("");

      const uploaded = await api.uploadApk({
        file,
        packageName: uploadPackageName.trim() || undefined,
        versionName: uploadVersionName.trim() || undefined,
        versionCode: uploadVersionCode ? Number(uploadVersionCode) : undefined,
        releaseNote: uploadReleaseNote.trim() || undefined,
        onProgress: setUploadProgress
      });

      setLastUploaded(uploaded);
      setFile(null);
      setUploadPackageName("");
      setUploadVersionName("");
      setUploadVersionCode("");
      setUploadReleaseNote("");
      await loadApks();
    } catch (err) {
      setError((err as Error).message || "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void loadApks();
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError(`${label} 복사 완료`);
    } catch {
      setError(`${label} 복사 실패`);
    }
  }

  const latestSummary = useMemo(() => {
    const grouped = new Map<string, ApkItem>();
    apks.forEach((item) => {
      const prev = grouped.get(item.packageName);
      if (!prev || item.versionCode > prev.versionCode) {
        grouped.set(item.packageName, item);
      }
    });
    return grouped.size;
  }, [apks]);

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>새 APK 버전 업로드</h3>
        <form className="grid-form" onSubmit={onUpload}>
          <label>
            APK 파일
            <input
              type="file"
              accept=".apk"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label>
            packageName (선택)
            <input
              value={uploadPackageName}
              onChange={(event) => setUploadPackageName(event.target.value)}
              placeholder="com.sistrun.app"
            />
          </label>
          <label>
            versionName (선택)
            <input
              value={uploadVersionName}
              onChange={(event) => setUploadVersionName(event.target.value)}
              placeholder="1.2.0"
            />
          </label>
          <label>
            versionCode (선택)
            <input
              value={uploadVersionCode}
              onChange={(event) => setUploadVersionCode(event.target.value)}
              placeholder="10200"
            />
          </label>
          <label className="wide">
            releaseNote (선택)
            <textarea
              rows={3}
              value={uploadReleaseNote}
              onChange={(event) => setUploadReleaseNote(event.target.value)}
              placeholder="릴리즈 노트를 입력하세요"
            />
          </label>
          <button type="submit" className="primary-button" disabled={uploading}>
            {uploading ? `업로드 중 ${uploadProgress}%` : "업로드"}
          </button>
        </form>

        {lastUploaded && (
          <div className="info-card">
            <h4>최근 업로드 결과</h4>
            <p>packageName: {lastUploaded.packageName}</p>
            <p>
              version: {lastUploaded.versionName} ({lastUploaded.versionCode})
            </p>
            <p>sha256: {lastUploaded.sha256 || "-"}</p>
            <p>fileSize: {lastUploaded.fileSize} bytes</p>
            <p>uploadedAt: {new Date(lastUploaded.uploadedAt).toLocaleString()}</p>
            {lastUploaded.downloadUrl && (
              <p>
                downloadUrl: <a href={lastUploaded.downloadUrl}>{lastUploaded.downloadUrl}</a>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>APK 목록</h3>
            <p className="muted">총 {apks.length}건 / 패키지 {latestSummary}개</p>
          </div>
          <button type="button" onClick={() => void loadApks()} disabled={loading}>
            새로고침
          </button>
        </div>

        <form className="inline-filters" onSubmit={onSearch}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="packageName 검색" />
          <input
            value={packageFilter}
            onChange={(event) => setPackageFilter(event.target.value)}
            placeholder="정확/부분 packageName 필터"
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={latestOnly}
              onChange={(event) => setLatestOnly(event.target.checked)}
            />
            최신 버전만 보기
          </label>
          <button type="submit" className="primary-button" disabled={loading}>
            검색
          </button>
        </form>

        {error && <p className="status">{error}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>packageName</th>
                <th>version</th>
                <th>sha256</th>
                <th>uploadedAt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apks.length === 0 ? (
                <tr>
                  <td colSpan={5}>표시할 APK가 없습니다.</td>
                </tr>
              ) : (
                apks.map((item) => (
                  <tr key={`${item.id}-${item.versionCode}`}>
                    <td>{item.packageName}</td>
                    <td>
                      {item.versionName} ({item.versionCode})
                    </td>
                    <td>{item.sha256 ? `${item.sha256.slice(0, 10)}...` : "-"}</td>
                    <td>{new Date(item.uploadedAt).toLocaleString()}</td>
                    <td>
                      <div className="action-row">
                        <Link to={`/apk/${encodeURIComponent(item.id || item.packageName)}`}>상세</Link>
                        {item.downloadUrl && (
                          <button type="button" onClick={() => void copyText(item.downloadUrl || "", "다운로드 URL")}>
                            링크복사
                          </button>
                        )}
                        {item.sha256 && (
                          <button type="button" onClick={() => void copyText(item.sha256, "SHA256")}>
                            SHA복사
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

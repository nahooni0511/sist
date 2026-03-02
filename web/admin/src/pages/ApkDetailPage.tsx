import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import { ApkDetail } from "../types/admin";

export default function ApkDetailPage() {
  const { apkId = "" } = useParams();
  const { api } = useAppContext();

  const [detail, setDetail] = useState<ApkDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await api.getApk(apkId);
      setDetail(data);
    } catch (err) {
      setError((err as Error).message || "APK 상세를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, apkId]);

  useEffect(() => {
    if (!apkId) {
      return;
    }
    void loadDetail();
  }, [apkId, loadDetail]);

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-head">
          <h3>APK 상세</h3>
          <div className="action-row">
            <button type="button" onClick={() => void loadDetail()} disabled={loading}>
              새로고침
            </button>
            <Link to="/apk">목록으로</Link>
          </div>
        </div>

        {error && <p className="status">{error}</p>}

        {detail?.apk ? (
          <div className="info-card">
            <p>ID: {detail.apk.id}</p>
            <p>packageName: {detail.apk.packageName}</p>
            <p>
              version: {detail.apk.versionName} ({detail.apk.versionCode})
            </p>
            <p>sha256: {detail.apk.sha256 || "-"}</p>
            <p>fileSize: {detail.apk.fileSize} bytes</p>
            <p>uploadedAt: {new Date(detail.apk.uploadedAt).toLocaleString()}</p>
            <p>releaseNote: {detail.apk.releaseNote || "-"}</p>
            {detail.apk.downloadUrl && (
              <p>
                downloadUrl: <a href={detail.apk.downloadUrl}>{detail.apk.downloadUrl}</a>
              </p>
            )}
          </div>
        ) : (
          <p className="empty-text">표시할 상세 정보가 없습니다.</p>
        )}
      </section>

      <section className="panel">
        <h3>버전 이력</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>version</th>
                <th>sha256</th>
                <th>uploadedAt</th>
                <th>다운로드</th>
              </tr>
            </thead>
            <tbody>
              {!detail || detail.versions.length === 0 ? (
                <tr>
                  <td colSpan={4}>버전 이력이 없습니다.</td>
                </tr>
              ) : (
                detail.versions.map((version) => (
                  <tr key={`${version.id}-${version.versionCode}`}>
                    <td>
                      {version.versionName} ({version.versionCode})
                    </td>
                    <td>{version.sha256 ? `${version.sha256.slice(0, 12)}...` : "-"}</td>
                    <td>{new Date(version.uploadedAt).toLocaleString()}</td>
                    <td>
                      {version.downloadUrl ? (
                        <a href={version.downloadUrl} target="_blank" rel="noreferrer">
                          다운로드
                        </a>
                      ) : (
                        "-"
                      )}
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

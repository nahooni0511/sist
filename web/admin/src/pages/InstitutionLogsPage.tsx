import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import { InstitutionActionLog } from "../types/admin";

export default function InstitutionLogsPage() {
  const { api } = useAppContext();
  const [logs, setLogs] = useState<InstitutionActionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [institutionId, setInstitutionId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [actionType, setActionType] = useState("");

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const items = await api.listGlobalInstitutionLogs({
        institutionId: institutionId.trim() || undefined,
        deviceId: deviceId.trim() || undefined,
        actionType: actionType.trim() || undefined,
        limit: 300
      });
      setLogs(items);
    } catch (err) {
      setError((err as Error).message || "로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [actionType, api, deviceId, institutionId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void loadLogs();
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h3>기관 액션 로그</h3>
        <div className="action-row">
          <button type="button" onClick={() => void loadLogs()} disabled={loading}>
            새로고침
          </button>
          <Link to="/institutions">기관 목록</Link>
        </div>
      </div>

      <form className="grid-form" onSubmit={onSearch}>
        <label>
          institutionId
          <input value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} />
        </label>
        <label>
          deviceId
          <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} />
        </label>
        <label>
          actionType
          <input value={actionType} onChange={(event) => setActionType(event.target.value)} />
        </label>
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={loading}>
            검색
          </button>
        </div>
      </form>

      {error ? <p className="status danger-text">{error}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>시간</th>
              <th>institutionId</th>
              <th>deviceId</th>
              <th>actionType</th>
              <th>actedBy</th>
              <th>payload</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6}>표시할 로그가 없습니다.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.actedAt).toLocaleString()}</td>
                  <td className="mono">{log.institutionId}</td>
                  <td className="mono">{log.deviceId || "-"}</td>
                  <td>{log.actionType}</td>
                  <td>{log.actedBy}</td>
                  <td className="mono">{log.actionPayload ? JSON.stringify(log.actionPayload) : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

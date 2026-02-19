import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { useAppContext } from "../hooks/useAppContext";
import { DeviceItem } from "../types/admin";

export default function DevicesPage() {
  const { api } = useAppContext();

  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const list = await api.listDevices({
        query: query.trim() || undefined
      });
      setDevices(list.sort((a, b) => a.deviceId.localeCompare(b.deviceId)));
    } catch (err) {
      setError((err as Error).message || "기기 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, query]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void loadDevices();
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h3>기기관리</h3>
        <div className="action-row">
          <button type="button" onClick={() => void loadDevices()} disabled={loading}>
            새로고침
          </button>
          <Link to="/devices/new">기기 추가</Link>
        </div>
      </div>

      <form className="inline-filters" onSubmit={onSearch}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="deviceId / 타입 / 모델명 / 위치명 검색"
        />
        <button type="submit" className="primary-button" disabled={loading}>
          검색
        </button>
      </form>

      {error && <p className="status">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>deviceId</th>
              <th>타입</th>
              <th>상태</th>
              <th>모델명</th>
              <th>위치</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td colSpan={6}>표시할 기기가 없습니다.</td>
              </tr>
            ) : (
              devices.map((item) => (
                <tr key={item.deviceId}>
                  <td>
                    <div className="muted mono">{item.deviceId}</div>
                  </td>
                  <td>{item.deviceType || "-"}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{item.model || "-"}</td>
                  <td>
                    {item.locationName || "-"}
                    {Number.isFinite(item.lat) && Number.isFinite(item.lng) ? (
                      <div className="muted mono">
                        <a href={`https://www.google.com/maps?q=${item.lat},${item.lng}`} target="_blank" rel="noreferrer">
                          {item.lat?.toFixed(5)}, {item.lng?.toFixed(5)}
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Link to={`/devices/${encodeURIComponent(item.deviceId)}`}>상세</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

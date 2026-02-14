import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DeviceMap from "../components/DeviceMap";
import StatusBadge from "../components/StatusBadge";
import { useAppContext } from "../hooks/useAppContext";
import { DeviceItem } from "../types/admin";

export default function DevicesPage() {
  const { api } = useAppContext();

  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "online" | "offline" | "unknown">("all");
  const [hasLocation, setHasLocation] = useState(false);
  const [mapMode, setMapMode] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const list = await api.listDevices({
        query: query.trim() || undefined,
        status,
        hasLocation
      });
      setDevices(list.sort((a, b) => Date.parse(b.lastSeen || "1970-01-01") - Date.parse(a.lastSeen || "1970-01-01")));
    } catch (err) {
      setError((err as Error).message || "기기 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, hasLocation, query, status]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void loadDevices();
  }

  const onlineCount = useMemo(() => devices.filter((d) => d.status === "online").length, [devices]);
  const withLocationCount = useMemo(
    () => devices.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng)).length,
    [devices]
  );

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>기기관리</h3>
          <p className="muted">
            총 {devices.length}대 / online {onlineCount}대 / GPS {withLocationCount}대
          </p>
        </div>
        <div className="action-row">
          <button type="button" onClick={() => void loadDevices()} disabled={loading}>
            새로고침
          </button>
          <button type="button" onClick={() => setMapMode((v) => !v)}>
            {mapMode ? "리스트 보기" : "지도 보기"}
          </button>
        </div>
      </div>

      <form className="inline-filters" onSubmit={onSearch}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="deviceId / deviceKey / 별칭 / 위치명 검색"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">전체 상태</option>
          <option value="online">online</option>
          <option value="offline">offline</option>
          <option value="unknown">unknown</option>
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={hasLocation} onChange={(event) => setHasLocation(event.target.checked)} />
          GPS 있는 기기만
        </label>
        <button type="submit" className="primary-button" disabled={loading}>
          검색
        </button>
      </form>

      {error && <p className="status">{error}</p>}

      {mapMode ? (
        <DeviceMap devices={devices} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>deviceId</th>
                <th>상태</th>
                <th>모델/OS</th>
                <th>위치</th>
                <th>lastSeen</th>
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
                      <strong>{item.deviceName || item.deviceId}</strong>
                      <div className="muted mono">{item.deviceId}</div>
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {(item.model || "-") + " / " + (item.osVersion || "-")}
                    </td>
                    <td>
                      {item.locationName || "-"}
                      {Number.isFinite(item.lat) && Number.isFinite(item.lng) && (
                        <div className="muted mono">
                          {item.lat?.toFixed(5)}, {item.lng?.toFixed(5)}
                        </div>
                      )}
                    </td>
                    <td>{item.lastSeen ? new Date(item.lastSeen).toLocaleString() : "-"}</td>
                    <td>
                      <Link to={`/devices/${encodeURIComponent(item.deviceId)}`}>상세</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

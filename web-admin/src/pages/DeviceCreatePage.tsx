import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import { DeviceType, NextDevicePreview } from "../types/admin";

export default function DeviceCreatePage() {
  const { api } = useAppContext();
  const navigate = useNavigate();

  const [deviceType, setDeviceType] = useState<DeviceType>("시스트파크");
  const [modelName, setModelName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [preview, setPreview] = useState<NextDevicePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const mapHref =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`
      : "";

  useEffect(() => {
    let mounted = true;
    setPreviewLoading(true);
    setPreviewError("");

    void api
      .previewNextDevice(deviceType)
      .then((result) => {
        if (!mounted) {
          return;
        }
        setPreview(result);
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        setPreview(null);
        setPreviewError((err as Error).message || "다음 deviceId 조회에 실패했습니다.");
      })
      .finally(() => {
        if (!mounted) {
          return;
        }
        setPreviewLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [api, deviceType]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const latNumber = Number(lat);
    const lngNumber = Number(lng);
    if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) {
      setError("위도/경도를 숫자로 입력해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      const created = await api.createDevice({
        deviceType,
        modelName: modelName.trim(),
        locationName: locationName.trim(),
        lat: latNumber,
        lng: lngNumber
      });

      navigate(`/devices/${encodeURIComponent(created.deviceId)}`);
    } catch (err) {
      setError((err as Error).message || "기기 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h3>기기 추가</h3>
        <Link to="/devices">목록으로</Link>
      </div>

      <form className="grid-form" onSubmit={onSubmit}>
        <label>
          타입
          <select value={deviceType} onChange={(event) => setDeviceType(event.target.value as DeviceType)}>
            <option value="시스트파크">시스트파크</option>
            <option value="시스트런">시스트런</option>
          </select>
        </label>
        <label>
          모델명
          <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="sistpark 32A" required />
        </label>
        <label>
          위치 이름
          <input value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder="서울숲 중앙광장" required />
        </label>
        <label>
          위도(lat)
          <input value={lat} onChange={(event) => setLat(event.target.value)} placeholder="37.54485" required />
        </label>
        <label>
          경도(lng)
          <input value={lng} onChange={(event) => setLng(event.target.value)} placeholder="127.03772" required />
        </label>
        <div className="wide info-card">
          <p>
            생성될 deviceId:{" "}
            <strong className="mono">
              {previewLoading ? "조회 중..." : preview?.deviceId || "-"}
            </strong>
          </p>
          <p>생성될 모듈:</p>
          {preview?.modules.length ? (
            <ul>
              {preview.modules.map((module) => (
                <li key={`${module.name}-${module.portNumber}`}>
                  {module.name} / 포트 {module.portNumber}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">모듈 정보가 없습니다.</p>
          )}
          {previewError ? <p className="status danger-text">{previewError}</p> : null}
        </div>
        <div className="wide action-row">
          {mapHref ? (
            <a href={mapHref} target="_blank" rel="noreferrer">
              구글맵으로 좌표 확인
            </a>
          ) : (
            <span className="muted">위도/경도를 입력하면 구글맵 링크가 활성화됩니다.</span>
          )}
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "등록 중..." : "기기 추가"}
          </button>
        </div>
      </form>

      {error ? <p className="status danger-text">{error}</p> : null}
    </section>
  );
}

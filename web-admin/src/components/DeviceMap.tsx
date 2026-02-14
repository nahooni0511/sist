import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { DeviceItem } from "../types/admin";
import { Link } from "react-router-dom";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

type Props = {
  devices: DeviceItem[];
};

export default function DeviceMap({ devices }: Props) {
  const withLocation = devices.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

  if (withLocation.length === 0) {
    return <p className="empty-text">좌표(lat/lng)가 보고된 기기가 없어 지도에 표시할 수 없습니다.</p>;
  }

  const center = {
    lat: withLocation[0].lat as number,
    lng: withLocation[0].lng as number
  };

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} className="map-wrap">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {withLocation.map((item) => (
        <Marker key={item.deviceId} position={[item.lat as number, item.lng as number]} icon={icon}>
          <Popup>
            <div className="map-popup">
              <strong>{item.deviceName || item.deviceId}</strong>
              <p>상태: {item.status}</p>
              <p>마지막 보고: {item.lastSeen ? new Date(item.lastSeen).toLocaleString() : "-"}</p>
              <Link to={`/devices/${encodeURIComponent(item.deviceId)}`}>상세로 이동</Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

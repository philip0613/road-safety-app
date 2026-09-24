import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Camera, Mic, Upload, MapPin, Navigation } from 'lucide-react';
import { motion } from 'framer-motion';

// Fix for default marker icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Problem {
  id: number;
  lat: number;
  lng: number;
  type: string;
  severity: string;
  description: string;
}

function LocationMarker({ 
  onMapClick 
}: { 
  onMapClick: (lat: number, lng: number) => void 
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapUpdater({ route }: { route: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (route.length > 0) {
      const bounds = L.latLngBounds(route);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [route, map]);
  return null;
}

function App() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reportLocation, setReportLocation] = useState<{lat: number, lng: number} | null>(null);
  const [startLocation, setStartLocation] = useState<{lat: number, lng: number} | null>(null);
  const [endLocation, setEndLocation] = useState<{lat: number, lng: number} | null>(null);
  const [mode] = useState<'report' | 'start' | 'end'>('report');
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startResults, setStartResults] = useState<any[]>([]);
  const [endResults, setEndResults] = useState<any[]>([]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (startQuery) handleSearch(startQuery, 'start');
      else setStartResults([]);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [startQuery]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (endQuery) handleSearch(endQuery, 'end');
      else setEndResults([]);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [endQuery]);

  const handleSearch = async (query: string, type: 'start' | 'end') => {
    if (!query) return;
    try {
      const response = await fetch(`http://localhost:3001/api/search?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (type === 'start') setStartResults(data.searchPoiInfo?.pois?.poi || []);
      else setEndResults(data.searchPoiInfo?.pois?.poi || []);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  useEffect(() => {
    // Set default start location to current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setStartLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      });
    }
  }, []);

  useEffect(() => {
    fetch('http://localhost:3001/api/problems')
      .then(res => res.json())
      .then(data => setProblems(data))
      .catch(err => console.error('Error fetching problems:', err));
  }, []);
  const [analysisResult, setAnalysisResult] = useState<{type: string, severity: string, description: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [rewardPoints] = useState(150);
  const [route, setRoute] = useState<[number, number][]>([]);

  const fetchRoute = async (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    try {
      console.log('Fetching route from:', start, 'to:', end);
      
      const response = await fetch(`http://localhost:3001/api/route?startLat=${start.lat}&startLng=${start.lng}&endLat=${end.lat}&endLng=${end.lng}`);
      const data = await response.json();
      console.log('Route data:', data);
      
      if (data.error) {
        console.error('Route API Error:', data.error);
        alert('경로를 찾을 수 없습니다: ' + data.error);
        return;
      }

      if (!data.features) {
        console.error('No features in route data', data);
        alert('경로 데이터가 없습니다.');
        return;
      }

      // TMAP API response parsing
      const coords: [number, number][] = [];
      data.features.forEach((feature: any) => {
        if (feature.geometry.type === 'LineString') {
          feature.geometry.coordinates.forEach((coord: any) => {
            // TMAP returns [lng, lat]
            coords.push([coord[1], coord[0]]); 
          });
        }
      });
      setRoute(coords);
    } catch (error) {
      console.error('Error fetching route:', error);
      alert('길찾기 정보를 가져오는 중 오류가 발생했습니다.');
    }
  };

  const handleProblemClick = (problem: Problem) => {
    console.log('Problem clicked:', problem);
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (mode === 'report') {
      setReportLocation({ lat, lng });
    } else if (mode === 'start') {
      setStartLocation({ lat, lng });
    } else if (mode === 'end') {
      setEndLocation({ lat, lng });
    }
  };

  const handleFindRoute = () => {
    if (startLocation && endLocation) {
      fetchRoute(startLocation, endLocation);
    } else {
      alert('출발지와 도착지를 모두 설정해주세요.');
    }
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setReportLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      });
    } else {
      alert('위치 정보를 사용할 수 없습니다.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setIsAnalyzing(true);
      const file = event.target.files[0];
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
          const response = await fetch('http://localhost:3001/api/analyze-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64String })
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error + (data.details ? ': ' + data.details : ''));
          }
          setAnalysisResult({
            type: '제보',
            severity: data.severity || 'yellow',
            description: data.description || '분석된 내용이 없습니다.'
          });
        } catch (error: any) {
          console.error('Error analyzing image:', error);
          alert('분석 중 오류가 발생했습니다: ' + error.message);
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <header className="p-4 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">road-safety-app</h1>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 h-1/2 lg:h-full bg-white border-b lg:border-b-0 lg:border-r border-gray-200 relative">
            <MapContainer center={[37.494, 126.826]} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer 
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            />
            <LocationMarker onMapClick={handleMapClick} />
            <MapUpdater route={route} />
            {problems.map(p => (
              <Marker key={p.id} position={[p.lat, p.lng]} eventHandlers={{ click: () => { handleProblemClick(p); setEndLocation({lat: p.lat, lng: p.lng}); } }}>
                <Popup>
                  <div className={`p-3 ${p.severity === 'red' ? 'text-red-600' : 'text-yellow-600'}`}>
                    <strong className="block text-lg">{p.type}</strong>
                    <p className="text-sm text-gray-700">{p.description}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
            {reportLocation && <Marker position={[reportLocation.lat, reportLocation.lng]} />}
            {startLocation && <Marker position={[startLocation.lat, startLocation.lng]} />}
            {endLocation && <Marker position={[endLocation.lat, endLocation.lng]} />}
            {route.length > 0 && <Polyline positions={route} color="#3b82f6" weight={5} opacity={0.7} />}
          </MapContainer>
        </div>

        {/* Controls Section - Mobile: Bottom Scrollable, Desktop: Right Sidebar */}
        <div className="w-full lg:w-1/3 overflow-y-auto p-4 md:p-6 space-y-6 bg-gray-50 lg:bg-white lg:border-l border-gray-200">
          <motion.div 
            whileHover={{ scale: 1.01 }}
            className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100"
          >
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
              <Camera className="text-blue-600" /> 제보하기
            </h2>
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleUseCurrentLocation}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors font-semibold"
              >
                <MapPin size={18} /> 현재 위치로 제보
              </button>
              <label className="w-full py-4 bg-blue-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 cursor-pointer transition-colors font-semibold">
                <Upload /> {isAnalyzing ? '분석 중...' : '사진 업로드'}
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={isAnalyzing} />
              </label>
              {reportLocation && (
                <p className="text-xs text-gray-500 text-center">선택된 위치: {reportLocation.lat.toFixed(4)}, {reportLocation.lng.toFixed(4)}</p>
              )}
            </div>
          </motion.div>

          {analysisResult && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl shadow-lg border-l-8 border-red-500"
            >
              <h2 className="text-xl font-bold mb-3 text-gray-800">AI 분석 결과</h2>
              <p className="text-gray-700 mb-4 leading-relaxed">{analysisResult.description}</p>
              <div className="bg-gray-100 p-4 rounded-xl text-sm text-gray-600">
                <strong className="block mb-1 text-gray-800">문의 문장:</strong>
                "역곡역 인근에서 {analysisResult.description}을 발견하여 제보합니다. 빠른 조치 부탁드립니다."
              </div>
            </motion.div>
          )}

          <motion.div 
            whileHover={{ scale: 1.01 }}
            className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100"
          >
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
              <Mic className="text-green-600" /> 음성 제보
            </h2>
            <button 
              onClick={() => setIsRecording(!isRecording)}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 ${isRecording ? 'bg-red-600' : 'bg-green-600'} text-white hover:opacity-90 transition-colors font-semibold`}
            >
              <Mic /> {isRecording ? '녹음 중... (클릭하여 정지)' : '음성으로 제보하기'}
            </button>
          </motion.div>

          <motion.div 
            className="bg-gradient-to-br from-yellow-400 to-yellow-600 p-6 rounded-2xl shadow-lg text-white"
          >
            <h2 className="text-lg font-bold mb-1">내 리워드</h2>
            <p className="text-4xl font-black">{rewardPoints} P</p>
            <p className="text-sm opacity-90 mt-2">랭킹: 상위 15%</p>
          </motion.div>

          <motion.div 
            className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100"
          >
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
              <Navigation className="text-blue-600" /> 길찾기
            </h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <input 
                  type="text" 
                  placeholder="출발지 검색" 
                  value={startQuery}
                  onChange={(e) => { setStartQuery(e.target.value); handleSearch(e.target.value, 'start'); }}
                  className="w-full p-2 border rounded-lg text-sm"
                />
                {startResults.length > 0 && (
                  <div className="bg-white border rounded-lg shadow-sm max-h-48 overflow-y-auto">
                    {startResults.map((poi: any, i: number) => (
                      <button key={i} className="block w-full text-left p-2 text-sm hover:bg-gray-100 border-b last:border-b-0" onClick={() => { setStartLocation({ lat: parseFloat(poi.noorLat), lng: parseFloat(poi.noorLon) }); setStartQuery(poi.name); setStartResults([]); }}>
                        <div className="font-medium">{poi.name}</div>
                        <div className="text-xs text-gray-500">{poi.middleAddrName} {poi.lowerAddrName}</div>
                      </button>
                    ))}
                  </div>
                )}
                <input 
                  type="text" 
                  placeholder="도착지 검색" 
                  value={endQuery}
                  onChange={(e) => setEndQuery(e.target.value)}
                  className="w-full p-2 border rounded-lg text-sm"
                />
                {endResults.length > 0 && (
                  <div className="bg-white border rounded-lg shadow-sm max-h-48 overflow-y-auto">
                    {endResults.map((poi: any, i: number) => (
                      <button key={i} className="block w-full text-left p-2 text-sm hover:bg-gray-100 border-b last:border-b-0" onClick={() => { setEndLocation({ lat: parseFloat(poi.noorLat), lng: parseFloat(poi.noorLon) }); setEndQuery(poi.name); setEndResults([]); }}>
                        <div className="font-medium">{poi.name}</div>
                        <div className="text-xs text-gray-500">{poi.middleAddrName} {poi.lowerAddrName}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button 
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                      setStartLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
                      setStartQuery('현재 위치');
                    });
                  }
                }}
                className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                현재 위치를 출발지로 설정
              </button>
              <button 
                onClick={handleFindRoute}
                className="w-full py-3 bg-blue-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors font-semibold"
              >
                <Navigation size={18} /> 길찾기 시작
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default App;

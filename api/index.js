const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Mock data
let problems = [
  { id: 1, lat: 37.494, lng: 126.826, type: '위험', severity: 'red', description: '도로 파손' },
  { id: 2, lat: 37.495, lng: 126.827, type: '주의', severity: 'yellow', description: '가로등 고장' },
];

app.get('/api/problems', (req, res) => {
  res.json(problems);
});

app.post('/api/reports', (req, res) => {
  const newReport = { id: Date.now(), ...req.body };
  problems.push(newReport);
  res.status(201).json(newReport);
});

app.get('/api/static-map', async (req, res) => {
  try {
    const { lat, lng, zoom = 15 } = req.query;
    const response = await axios.get('https://apis.openapi.sk.com/tmap/staticMap', {
      params: {
        version: 1,
        coordType: 'WGS84GEO',
        width: 512,
        height: 512,
        zoom: zoom,
        format: 'PNG',
        longitude: lng,
        latitude: lat,
        markers: `${lng},${lat}`
      },
      headers: {
        'appKey': process.env.TMAP_APP_KEY,
        'Accept': 'application/json'
      },
      responseType: 'arraybuffer'
    });
    res.set('Content-Type', 'image/png');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching static map:', error);
    res.status(500).send('Error fetching map');
  }
});

app.get('/api/route', async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng } = req.query;
    
    const payload = {
      startX: parseFloat(startLng),
      startY: parseFloat(startLat),
      endX: parseFloat(endLng),
      endY: parseFloat(endLat),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: '출발',
      endName: '도착',
      searchOption: '0',
      sort: 'index'
    };

    const response = await axios.post(`https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&appKey=${process.env.TMAP_APP_KEY}`, payload, {
      headers: {
        'appKey': process.env.TMAP_APP_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ 
      error: 'Route API Error', 
      details: error.response?.data || error.message 
    });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await axios.get('https://apis.openapi.sk.com/tmap/pois', {
      params: {
        version: 1,
        searchKeyword: query,
        resCoordType: 'WGS84GEO',
        reqCoordType: 'WGS84GEO',
        count: 5
      },
      headers: {
        'appKey': process.env.TMAP_APP_KEY
      }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Search API Error' });
  }
});

app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: '이미지 데이터가 없습니다.' });
    }
    
    const payload = {
      contents: [{
        parts: [
          { text: '당신은 도로 안전 전문가입니다. 사진을 분석하여 도로 파손(균열, 포트홀 등), 장애물, 가로등 고장 등 안전 문제를 식별하세요. 반드시 JSON 형식으로만 응답하세요. 형식: {"severity": "red" | "yellow" | "green", "description": "구체적인 설명"}' },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64
            }
          }
        ]
      }]
    };

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
    }

    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.data.candidates || response.data.candidates.length === 0) {
      throw new Error('Gemini API에서 올바른 응답을 받지 못했습니다.');
    }
    const content = response.data.candidates[0].content.parts[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { severity: 'green', description: '분석된 내용이 없습니다.' };
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'AI 분석 실패', 
      details: error.response?.data?.error?.message || error.message 
    });
  }
});

module.exports = app;
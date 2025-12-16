import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Trash2, Calendar, Clock, AlertTriangle, Eye, Shield, Settings } from 'lucide-react';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// 파일 크기 포맷팅 함수 (변동 없음)
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function S3ImageViewer() {
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [sortBy, setSortBy] = useState('newest');
  const [filterDate, setFilterDate] = useState('all'); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // 새로고침 간격 상태 (기본값: 30초)
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(30); 
  const [stats, setStats] = useState({
    lastHour: 0,
    today: 0,
    total: 0
  });

  // S3 클라이언트 설정 (변동 없음)
  const s3Client = new S3Client({
    region: import.meta.env.VITE_AWS_REGION,
    credentials: {
      accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
    },
  });

  const bucketName = import.meta.env.VITE_AWS_BUCKET_NAME;

  // S3에서 이미지 목록 가져오기
  const loadImagesFromS3 = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
      });

      const response = await s3Client.send(command);
      
      if (!response.Contents || response.Contents.length === 0) {
        setImages([]);
        setStats({ lastHour: 0, today: 0, total: 0 });
        setIsLoading(false);
        return;
      }

      const imagePromises = response.Contents
        .filter(item => {
          const key = item.Key.toLowerCase();
          return key.endsWith('.jpg') || key.endsWith('.jpeg');
        })
        .map(async (item) => {
          const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: item.Key,
          });
          const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

          return {
            id: item.Key,
            key: item.Key,
            url: url,
            name: item.Key.split('/').pop(),
            timestamp: item.LastModified,
            size: formatFileSize(item.Size),
          };
        });

      const imageList = await Promise.all(imagePromises);
      imageList.sort((a, b) => b.timestamp - a.timestamp);
      
      setImages(imageList);
      
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const todayStart = new Date().setHours(0, 0, 0, 0);
      
      setStats({
        lastHour: imageList.filter(img => img.timestamp.getTime() > oneHourAgo).length,
        today: imageList.filter(img => img.timestamp.getTime() > todayStart).length,
        total: imageList.length
      });

    } catch (err) {
      console.error('S3 로딩 에러:', err);
      setError('S3에서 이미지를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // useEffect 로직: refreshIntervalSec이 변경될 때마다 타이머를 다시 설정
  useEffect(() => {
    loadImagesFromS3();
    
    const intervalMs = refreshIntervalSec * 1000;
    
    if (intervalMs === 0) return () => {}; // 0초(정지)일 경우 타이머 설정 안 함

    const interval = setInterval(() => {
      loadImagesFromS3();
    }, intervalMs);
    
    return () => clearInterval(interval);
  }, [refreshIntervalSec]); 

  const refreshImages = () => {
    loadImagesFromS3();
  };
  
  const handleDelete = async (img) => {
    if (!confirm(`"${img.name}"을(를) 삭제하시겠습니까?`)) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: img.key,
      });

      await s3Client.send(command);
      
      const newImages = images.filter(i => i.id !== img.id);
      setImages(newImages);
      
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const todayStart = new Date().setHours(0, 0, 0, 0);
      
      setStats({
        lastHour: newImages.filter(i => i.timestamp.getTime() > oneHourAgo).length,
        today: newImages.filter(i => i.timestamp.getTime() > todayStart).length,
        total: newImages.length
      });
      
      if (selectedImage?.id === img.id) setSelectedImage(null);
      
    } catch (err) {
      console.error('삭제 에러:', err);
      alert('이미지 삭제에 실패했습니다.');
    }
  };

  const handleDownload = async (img) => {
    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = img.name;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('다운로드 에러:', err);
      alert('다운로드에 실패했습니다.');
    }
  };

  const sortImages = (imgs) => {
    const sorted = [...imgs];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => b.timestamp - a.timestamp);
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => a.timestamp - b.timestamp);
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  };

  const filterImages = (imgs) => {
    if (filterDate === 'all') return imgs;
    const now = Date.now();
    
    const filtered = imgs.filter(img => {
      const diff = now - img.timestamp.getTime();
      
      if (filterDate === 'lastHour') {
        return diff < 60 * 60 * 1000;
      }
      if (filterDate === 'today') {
        const todayStart = new Date().setHours(0, 0, 0, 0);
        return img.timestamp.getTime() > todayStart;
      }
      return true;
    });
    return filtered;
  };

  const displayImages = sortImages(filterImages(images));

  const handleStatClick = (filter) => {
    setFilterDate(filter);
    setSortBy('newest'); 
  };


  // 로딩/에러 화면 
  if (isLoading && images.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center w-full">
        <div className="text-center w-full">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg">모니터링 데이터 로딩 중...</p>
        </div>
        <div className='w-full' />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 w-full">
        <div className="bg-white border border-red-300 rounded shadow-lg p-8 max-w-md w-full">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-600 text-center mb-2">시스템 오류</h2>
          <p className="text-gray-600 text-center mb-4">{error}</p>
          <button
            onClick={refreshImages}
            className="w-full bg-red-500 text-white py-2 rounded hover:bg-red-600 transition-colors font-medium"
          >
            재연결 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* 헤더 */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="px-6 sm:px-12 xl:px-16 py-4 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500 p-2 rounded">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-blue-700">냉장고 모니터링 대시보드</h1>
                <p className="text-sm text-gray-500">REFRIGERATOR ACCESS LOGS</p>
              </div>
            </div>
            
            <div className='flex items-center gap-4'>
              {/* 새로고침 간격 설정 드롭다운 */}
              <div className="flex items-center gap-2 border border-gray-300 rounded p-1 bg-gray-50 text-sm">
                <Settings className="w-4 h-4 text-gray-600 ml-1" />
                <span className='text-gray-700'>자동 새로고침:</span>
                <select
                  value={refreshIntervalSec}
                  onChange={(e) => setRefreshIntervalSec(Number(e.target.value))}
                  className="px-1 py-1 bg-white border border-gray-300 rounded text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={0}>정지</option>
                  <option value={5}>5초</option>
                  <option value={10}>10초</option>
                  <option value={15}>15초</option>
                  <option value={30}>30초</option>
                  <option value={60}>1분</option>
                  <option value={300}>5분</option>
                </select>
              </div>
            
              <button
                onClick={refreshImages}
                disabled={isLoading}
                className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                데이터 새로고침
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 영역 */}
      <div className="px-6 sm:px-12 xl:px-16 py-6 w-full">
        {/* 경고 배너 (주의 문구 수정) */}
        <div className="bg-yellow-50 border border-yellow-300 rounded p-4 mb-6 flex items-center gap-3 w-full"> 
          <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-yellow-800 font-bold">⚠️ 주의: 모든 로그가 기록됩니다.</p>
            <p className="text-gray-600 text-sm">기록되는 데이터는 법적으로 보호를 받고 있으며, 무단 도용 시 학생처 징계 및 법적 조치가 취해질 수 있습니다.</p>
          </div>
        </div>

        {/* 통계 카드 (선택 효과 강화) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* 최근 1시간 감지 */}
          <button 
            onClick={() => handleStatClick('lastHour')}
            className={`bg-white border rounded p-6 shadow-sm text-left transition-all ${
              filterDate === 'lastHour' ? 'border-blue-500 ring-4 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm font-medium">최근 1시간 감지</span>
              <Eye className={`w-5 h-5 ${filterDate === 'lastHour' ? 'text-blue-500' : 'text-gray-400'}`} />
            </div>
            <div className="text-3xl font-bold text-blue-700 mb-1">{stats.lastHour}건</div>
            <div className="text-gray-400 text-xs">LAST HOUR</div>
          </button>
          
          {/* 오늘 기록 */}
          <button 
            onClick={() => handleStatClick('today')}
            className={`bg-white border rounded p-6 shadow-sm text-left transition-all ${
              filterDate === 'today' ? 'border-blue-500 ring-4 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm font-medium">오늘 기록</span>
              <Calendar className={`w-5 h-5 ${filterDate === 'today' ? 'text-blue-500' : 'text-gray-400'}`} />
            </div>
            <div className="text-3xl font-bold text-blue-700 mb-1">{stats.today}건</div>
            <div className="text-gray-400 text-xs">TODAY</div>
          </button>
          
          {/* 전체 기록 */}
          <button 
            onClick={() => handleStatClick('all')}
            className={`bg-white border rounded p-6 shadow-sm text-left transition-all ${
              filterDate === 'all' ? 'border-blue-500 ring-4 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm font-medium">전체 기록</span>
              <Shield className={`w-5 h-5 ${filterDate === 'all' ? 'text-blue-500' : 'text-gray-400'}`} />
            </div>
            <div className="text-3xl font-bold text-blue-700 mb-1">{stats.total}건</div>
            <div className="text-gray-400 text-xs">TOTAL RECORDS</div>
          </button>
        </div>

        {/* 정렬 옵션: w-full 유지 */}
        <div className="bg-white border border-gray-200 rounded p-4 mb-6 flex flex-wrap gap-4 items-center shadow-sm w-full"> 
          
          {/* 정렬 옵션 */}
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="name">이름순</option>
            </select>
          </div>
          
          <div className="ml-auto text-sm text-gray-500">
            총 {displayImages.length}개 기록
          </div>
        </div>

        {/* 이미지 그리드 또는 데이터 없음 표시 */}
        {displayImages.length === 0 ? (
          <div 
            className="bg-white border border-gray-200 rounded p-12 text-center shadow-sm w-full"
          >
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">기록된 데이터 없음</p>
            <p className="text-gray-400 text-sm mt-2">모니터링 시스템 대기 중</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {displayImages.map((img) => (
              <div
                key={img.id}
                // 이미지 선택 시 효과 강화
                className={`bg-white border rounded overflow-hidden shadow-sm transition-colors cursor-pointer group 
                  ${selectedImage?.id === img.id ? 'border-blue-500 ring-4 ring-blue-200' : 'border-gray-200 hover:border-blue-300'}`}
                onClick={() => setSelectedImage(img)}
              >
                <div
                  className="aspect-video bg-gray-100 overflow-hidden relative"
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-opacity"
                  />
                  {(Date.now() - img.timestamp.getTime()) < 60 * 60 * 1000 && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">
                      NEW
                    </div>
                  )}
                </div>
                
                <div className="p-3">
                  <p className="text-sm font-mono text-gray-700 truncate mb-1">{img.name}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>{img.timestamp.toLocaleString('ko-KR', { 
                      month: 'short', 
                      day: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}</span>
                    <span>{img.size}</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(img);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 bg-gray-100 text-gray-700 px-3 py-2 rounded text-xs font-medium hover:bg-gray-200 transition-colors border border-gray-300"
                    >
                      <Download className="w-3 h-3" />
                      다운로드
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(img);
                      }}
                      className="flex items-center justify-center bg-red-100 text-red-600 px-3 py-2 rounded text-xs font-medium hover:bg-red-200 transition-colors border border-red-300"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 이미지 상세 모달 (변동 없음) */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-white border border-gray-300 rounded w-full max-w-6xl max-h-[95vh] overflow-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-gray-800 font-semibold">{selectedImage.name}</h3>
                <p className="text-sm text-gray-500">
                  {selectedImage.timestamp.toLocaleString('ko-KR')} · {selectedImage.size}
                </p>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="relative">
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="w-full max-h-[75vh] object-contain bg-gray-100"
              />
            </div>
            
            <div className="p-4 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => handleDownload(selectedImage)}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                다운로드
              </button>
              <button
                onClick={() => {
                  handleDelete(selectedImage);
                }}
                className="flex items-center justify-center gap-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors font-medium"
              >
                <Trash2 className="w-4 h-4" />
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

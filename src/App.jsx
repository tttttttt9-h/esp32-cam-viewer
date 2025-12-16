import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Trash2, Calendar, Clock, AlertTriangle, Eye, Shield } from 'lucide-react';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export default function S3ImageViewer() {
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [sortBy, setSortBy] = useState('newest');
  const [filterDate, setFilterDate] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    lastHour: 0,
    today: 0,
    total: 0
  });

  // S3 클라이언트 설정
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

      // JPEG 파일만 필터링하고 URL 생성
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

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  useEffect(() => {
    loadImagesFromS3();
    const interval = setInterval(() => {
      loadImagesFromS3();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
    const now = new Date();
    const filtered = imgs.filter(img => {
      const diff = now - img.timestamp;
      if (filterDate === 'today') return diff < 24 * 60 * 60 * 1000;
      if (filterDate === 'week') return diff < 7 * 24 * 60 * 60 * 1000;
      if (filterDate === 'month') return diff < 30 * 24 * 60 * 60 * 1000;
      return true;
    });
    return filtered;
  };

  const displayImages = sortImages(filterImages(images));

  if (isLoading && images.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">감시 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-red-950 border border-red-800 rounded p-8 max-w-md w-full">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-400 text-center mb-2">시스템 오류</h2>
          <p className="text-gray-400 text-center mb-4">{error}</p>
          <button
            onClick={refreshImages}
            className="w-full bg-red-700 text-white py-2 rounded hover:bg-red-600 transition-colors"
          >
            재연결 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 헤더 */}
      <header className="bg-gray-900 border-b border-red-900">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-red-900 p-2 rounded">
                <Shield className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-red-400">냉장고 감시 시스템</h1>
                <p className="text-sm text-gray-500">REFRIGERATOR SECURITY MONITORING</p>
              </div>
            </div>
            
            <button
              onClick={refreshImages}
              disabled={isLoading}
              className="flex items-center gap-2 bg-red-900 text-white px-4 py-2 rounded hover:bg-red-800 transition-colors disabled:opacity-50 border border-red-700"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* 경고 배너 */}
        <div className="bg-red-950 border border-red-800 rounded p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-bold">⚠️ 경고: 모든 접근 기록이 저장되고 있습니다</p>
            <p className="text-gray-400 text-sm">무단 도용 시 학생처 징계 및 법적 조치가 취해질 수 있습니다</p>
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-700 rounded p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm font-medium">최근 1시간 감지</span>
              <Eye className="w-5 h-5 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-400 mb-1">{stats.lastHour}건</div>
            <div className="text-gray-500 text-xs">LAST HOUR</div>
          </div>
          
          <div className="bg-gray-900 border border-gray-700 rounded p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm font-medium">오늘 기록</span>
              <Calendar className="w-5 h-5 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-400 mb-1">{stats.today}건</div>
            <div className="text-gray-500 text-xs">TODAY</div>
          </div>
          
          <div className="bg-gray-900 border border-gray-700 rounded p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm font-medium">전체 기록</span>
              <Shield className="w-5 h-5 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-400 mb-1">{stats.total}건</div>
            <div className="text-gray-500 text-xs">TOTAL RECORDS</div>
          </div>
        </div>

        {/* 필터 */}
        <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-2 bg-black border border-gray-700 rounded text-sm text-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="all">전체 기간</option>
              <option value="today">오늘</option>
              <option value="week">최근 7일</option>
              <option value="month">최근 30일</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 bg-black border border-gray-700 rounded text-sm text-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
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

        {/* 이미지 그리드 */}
        {displayImages.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded p-12 text-center">
            <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">기록된 데이터 없음</p>
            <p className="text-gray-600 text-sm mt-2">감시 시스템 대기 중</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayImages.map((img) => (
              <div
                key={img.id}
                className="bg-gray-900 border border-gray-700 rounded overflow-hidden hover:border-red-700 transition-colors cursor-pointer group"
              >
                <div
                  onClick={() => setSelectedImage(img)}
                  className="aspect-video bg-black overflow-hidden relative"
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                  {(Date.now() - img.timestamp.getTime()) < 60 * 60 * 1000 && (
                    <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">
                      NEW
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-red-500 text-xs px-2 py-1 rounded font-mono">
                    REC ●
                  </div>
                </div>
                
                <div className="p-3">
                  <p className="text-sm font-mono text-gray-300 truncate mb-1">{img.name}</p>
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
                      className="flex-1 flex items-center justify-center gap-1 bg-gray-800 text-gray-300 px-3 py-2 rounded text-xs font-medium hover:bg-gray-700 transition-colors border border-gray-700"
                    >
                      <Download className="w-3 h-3" />
                      다운로드
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(img);
                      }}
                      className="flex items-center justify-center bg-red-900 text-red-300 px-3 py-2 rounded text-xs font-medium hover:bg-red-800 transition-colors border border-red-800"
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

      {/* 이미지 상세 모달 */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-gray-900 border border-red-900 rounded w-full max-w-6xl max-h-[95vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-gray-300 font-semibold">{selectedImage.name}</h3>
                <p className="text-sm text-gray-500">
                  {selectedImage.timestamp.toLocaleString('ko-KR')} · {selectedImage.size}
                </p>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 hover:text-gray-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="relative">
              <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-red-500 text-sm px-3 py-1 rounded font-mono">
                REC ● RECORDING
              </div>
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="w-full max-h-[75vh] object-contain bg-black"
              />
            </div>
            
            <div className="p-4 border-t border-gray-800 flex gap-2">
              <button
                onClick={() => handleDownload(selectedImage)}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-800 text-gray-300 px-4 py-2 rounded hover:bg-gray-700 transition-colors border border-gray-700"
              >
                <Download className="w-4 h-4" />
                다운로드
              </button>
              <button
                onClick={() => {
                  handleDelete(selectedImage);
                }}
                className="flex items-center justify-center gap-2 bg-red-900 text-red-300 px-4 py-2 rounded hover:bg-red-800 transition-colors border border-red-800"
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

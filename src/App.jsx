import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Trash2, Calendar, Clock, HardDrive, TrendingUp, AlertCircle } from 'lucide-react';
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
        // Prefix: 'esp32/', // 특정 폴더만 가져오려면 주석 해제
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
          // Presigned URL 생성 (1시간 유효)
          const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: item.Key,
          });
          const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

          return {
            id: item.Key,
            key: item.Key,
            url: url,
            name: item.Key.split('/').pop(), // 파일명만 추출
            timestamp: item.LastModified,
            size: formatFileSize(item.Size),
          };
        });

      const imageList = await Promise.all(imagePromises);
      
      // 최신순 정렬
      imageList.sort((a, b) => b.timestamp - a.timestamp);
      
      setImages(imageList);
      
      // 통계 계산
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
      setError('S3에서 이미지를 불러오는데 실패했습니다. AWS 설정을 확인해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  // 파일 크기 포맷팅
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  useEffect(() => {
    loadImagesFromS3();
    
    // 5분마다 자동 새로고침
    const interval = setInterval(() => {
      loadImagesFromS3();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const refreshImages = () => {
    loadImagesFromS3();
  };

  // S3에서 이미지 삭제
  const handleDelete = async (img) => {
    if (!confirm(`"${img.name}"을(를) 삭제하시겠습니까?`)) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: img.key,
      });

      await s3Client.send(command);
      
      // 로컬 상태에서도 제거
      const newImages = images.filter(i => i.id !== img.id);
      setImages(newImages);
      
      // 통계 재계산
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

  // 이미지 다운로드
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg">S3에서 이미지를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">연결 오류</h2>
          <p className="text-gray-600 text-center mb-4">{error}</p>
          <button
            onClick={refreshImages}
            className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">ESP32 CAM Monitor</h1>
                <p className="text-sm text-gray-500">실시간 이미지 모니터링</p>
              </div>
            </div>
            
            <button
              onClick={refreshImages}
              disabled={isLoading}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-100 text-sm font-medium">최근 1시간</span>
              <TrendingUp className="w-5 h-5 text-blue-200" />
            </div>
            <div className="text-3xl font-bold mb-1">{stats.lastHour}장</div>
            <div className="text-blue-100 text-xs">활발한 촬영 중</div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-purple-100 text-sm font-medium">오늘</span>
              <Calendar className="w-5 h-5 text-purple-200" />
            </div>
            <div className="text-3xl font-bold mb-1">{stats.today}장</div>
            <div className="text-purple-100 text-xs">금일 촬영 총량</div>
          </div>
          
          <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-pink-100 text-sm font-medium">전체</span>
              <HardDrive className="w-5 h-5 text-pink-200" />
            </div>
            <div className="text-3xl font-bold mb-1">{stats.total}장</div>
            <div className="text-pink-100 text-xs">저장된 이미지</div>
          </div>
        </div>

        {/* 필터 및 정렬 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
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
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="name">이름순</option>
            </select>
          </div>
          
          <div className="ml-auto text-sm text-gray-600">
            총 {displayImages.length}개 이미지
          </div>
        </div>

        {/* 이미지 그리드 */}
        {displayImages.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 text-lg">이미지가 없습니다</p>
            <p className="text-gray-400 text-sm mt-2">ESP32 CAM에서 이미지를 업로드해주세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayImages.map((img) => (
              <div
                key={img.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
              >
                <div
                  onClick={() => setSelectedImage(img)}
                  className="aspect-video bg-gray-100 overflow-hidden relative"
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* 최근 1시간 이미지 배지 */}
                  {(Date.now() - img.timestamp.getTime()) < 60 * 60 * 1000 && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                      NEW
                    </div>
                  )}
                </div>
                
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-800 truncate mb-1">{img.name}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>{img.timestamp.toLocaleString('ko-KR', { 
                      month: 'short', 
                      day: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}</span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {img.size}
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(img);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 bg-blue-50 text-blue-600 px-3 py-2 rounded text-xs font-medium hover:bg-blue-100 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      다운로드
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(img);
                      }}
                      className="flex items-center justify-center bg-red-50 text-red-600 px-3 py-2 rounded text-xs font-medium hover:bg-red-100 transition-colors"
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
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{selectedImage.name}</h3>
                <p className="text-sm text-gray-500">
                  {selectedImage.timestamp.toLocaleString('ko-KR')} · {selectedImage.size}
                </p>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <img
              src={selectedImage.url}
              alt={selectedImage.name}
              className="w-full max-h-[75vh] object-contain bg-gray-900"
            />
            
            <div className="p-4 border-t flex gap-2">
              <button
                onClick={() => handleDownload(selectedImage)}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                다운로드
              </button>
              <button
                onClick={() => {
                  handleDelete(selectedImage);
                }}
                className="flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
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
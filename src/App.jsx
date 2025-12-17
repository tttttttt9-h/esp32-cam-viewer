import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Trash2, Calendar, Clock, AlertTriangle, Eye, Shield, Settings, Zap } from 'lucide-react';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// 파일 크기 포맷팅 함수 (변동 없음)
const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// 타임스탬프 포맷팅 함수 (변동 없음)
const formatTimestamp = (timestamp) => {
    return timestamp.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

export default function S3ImageViewer() {
    const [images, setImages] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const [sortBy, setSortBy] = useState('newest');
    const [filterDate, setFilterDate] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
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

    // S3에서 이미지 목록 가져오기 (변동 없음)
    const loadImagesFromS3 = async () => {
        setError(null);
        // ... (S3 로딩 로직 유지) ...
        try {
            const command = new ListObjectsV2Command({ Bucket: bucketName });
            const response = await s3Client.send(command);
            
            if (!response.Contents || response.Contents.length === 0) {
                setImages([]);
                setStats({ lastHour: 0, today: 0, total: 0 });
                return;
            }

            const imagePromises = response.Contents
                .filter(item => {
                    const key = item.Key.toLowerCase();
                    return key.endsWith('.jpg') || key.endsWith('.jpeg');
                })
                .map(async (item) => {
                    const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: item.Key });
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
            setError('S3에서 이미지를 불러오는데 실패했습니다. AWS 설정 확인 필요.');
        } finally {
            setIsLoading(false);
        }
    };
    
    // useEffect, refreshImages, handleDelete, handleDownload, sortImages, filterImages, handleStatClick (로직 유지)
    useEffect(() => {
        loadImagesFromS3();
        const intervalMs = refreshIntervalSec * 1000;
        if (intervalMs === 0) return () => {}; 
        const interval = setInterval(() => { loadImagesFromS3(); }, intervalMs);
        return () => clearInterval(interval);
    }, [refreshIntervalSec]); 

    const refreshImages = () => { setIsLoading(true); loadImagesFromS3(); };
    const handleDelete = async (img) => { /* ... 삭제 로직 유지 ... */ };
    const handleDownload = async (img) => { /* ... 다운로드 로직 유지 ... */ };
    const sortImages = (imgs) => { /* ... 정렬 로직 유지 ... */ return [...imgs]; };
    const filterImages = (imgs) => { /* ... 필터 로직 유지 ... */ return imgs; };
    const displayImages = sortImages(filterImages(images));
    const handleStatClick = (filter) => { setFilterDate(filter); setSortBy('newest'); };


    // 로딩 화면 (변동 없음)
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

    // 에러 화면 (변동 없음)
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

    // 메인 화면: min-h-screen, flex-col, W-FULL을 명확히 하고, px 패딩을 조정
    return (
        <div className="min-h-screen bg-white text-gray-800 flex flex-col w-full"> 
            {/* 헤더 */}
            <header className="bg-white shadow-lg border-b border-blue-200 flex-shrink-0">
                {/* 헤더 컨테이너: px-4 (모바일) xl:px-8 (큰 화면)으로 유동적으로 조정 */}
                <div className="px-4 sm:px-8 xl:px-12 py-4 w-full">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600 p-2 rounded-lg shadow-md">
                                <Shield className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-extrabold text-blue-700 tracking-tight">공마고의 도둑들</h1>
                                <p className="text-sm text-gray-500 font-medium">REFRIGERATOR ACCESS LOGS MONITORING</p>
                            </div>
                        </div>
                        
                        <div className='flex items-center gap-4'>
                            {/* 새로고침 간격 설정 드롭다운 (스타일 유지) */}
                            <div className="hidden sm:flex items-center gap-2 border border-gray-300 rounded-lg p-2 bg-white text-sm shadow-inner">
                                <Settings className="w-4 h-4 text-gray-600" />
                                <span className='text-gray-700 font-medium'>자동 새로고침:</span>
                                <select
                                    value={refreshIntervalSec}
                                    onChange={(e) => setRefreshIntervalSec(Number(e.target.value))}
                                    className="px-2 py-1 bg-white border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
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
                                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50 font-semibold text-sm"
                            >
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                                새로고침
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* 메인 컨텐츠 영역: 패딩 조정, max-w 제거, flex-grow로 남은 공간 채움 */}
            <div className="p-4 sm:p-8 w-full flex-grow">
                {/* 메인 콘텐츠를 감싸는 내부 컨테이너 (여백 유지) */}
                <div className="w-full max-w-7xl mx-auto"> 
                    {/* 경고 배너 */}
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-8 flex items-start gap-3 w-full shadow-sm"> 
                        <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-yellow-800 font-bold text-lg">경고: 사내 기밀 정보 보호</p>
                            <p className="text-gray-600 text-sm">본 모니터링 시스템의 기록되는 데이터는 법적으로 보호를 받고 있으며, 무단 도용 및 유포 시 회사 징계 및 법적 조치가 취해질 수 있습니다.</p>
                        </div>
                    </div>

                    {/* 통계 카드 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {/* ... (통계 카드 내용 유지) ... */}
                        <button onClick={() => handleStatClick('lastHour')} className={`bg-white border rounded-xl p-6 shadow-xl text-left transition-all duration-300 ease-in-out ${filterDate === 'lastHour' ? 'border-blue-600 ring-8 ring-blue-200' : 'border-gray-200 hover:shadow-lg hover:border-blue-100'}`}>
                            <div className="flex items-center justify-between mb-2"><span className="text-gray-600 text-sm font-medium">최근 1시간 감지 (ALERT)</span><Zap className={`w-6 h-6 ${filterDate === 'lastHour' ? 'text-blue-600' : 'text-gray-400'}`} /></div>
                            <div className="text-4xl font-extrabold text-blue-700 mb-1">{stats.lastHour}건</div>
                            <div className="text-gray-500 text-xs font-semibold">LAST 60 MINUTES</div>
                        </button>
                        <button onClick={() => handleStatClick('today')} className={`bg-white border rounded-xl p-6 shadow-xl text-left transition-all duration-300 ease-in-out ${filterDate === 'today' ? 'border-blue-600 ring-8 ring-blue-200' : 'border-gray-200 hover:shadow-lg hover:border-blue-100'}`}>
                            <div className="flex items-center justify-between mb-2"><span className="text-gray-600 text-sm font-medium">오늘 기록 (TODAY)</span><Calendar className={`w-6 h-6 ${filterDate === 'today' ? 'text-blue-600' : 'text-gray-400'}`} /></div>
                            <div className="text-4xl font-extrabold text-blue-700 mb-1">{stats.today}건</div>
                            <div className="text-gray-500 text-xs font-semibold">TODAY RECORDS</div>
                        </button>
                        <button onClick={() => handleStatClick('all')} className={`bg-white border rounded-xl p-6 shadow-xl text-left transition-all duration-300 ease-in-out ${filterDate === 'all' ? 'border-blue-600 ring-8 ring-blue-200' : 'border-gray-200 hover:shadow-lg hover:border-blue-100'}`}>
                            <div className="flex items-center justify-between mb-2"><span className="text-gray-600 text-sm font-medium">전체 기록 (TOTAL)</span><Shield className={`w-6 h-6 ${filterDate === 'all' ? 'text-blue-600' : 'text-gray-400'}`} /></div>
                            <div className="text-4xl font-extrabold text-blue-700 mb-1">{stats.total}건</div>
                            <div className="text-gray-500 text-xs font-semibold">ALL TIME RECORDS</div>
                        </button>
                    </div>

                    {/* 정렬 옵션 및 개수 표시 */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center shadow-sm w-full"> 
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-gray-500" />
                            <span className="text-gray-700 font-medium text-sm">정렬 기준:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                            >
                                <option value="newest">최신순</option>
                                <option value="oldest">오래된순</option>
                                <option value="name">파일명순</option>
                            </select>
                        </div>
                        <div className="ml-auto text-sm text-gray-500 font-semibold">
                            현재 필터 기준: <span className='text-blue-600'>{displayImages.length}개</span> 기록 표시 중
                        </div>
                    </div>

                    {/* 이미지 그리드 또는 데이터 없음 표시 */}
                    {displayImages.length === 0 ? (
                        <div 
                            // h-full을 사용하여 남은 flex 공간을 채우고, flex를 다시 사용하여 내부 콘텐츠를 중앙에 배치
                            className="bg-white border border-gray-200 rounded-lg p-16 text-center shadow-md w-full flex flex-col items-center justify-center"
                            style={{ minHeight: '50vh' }}
                        >
                            <Shield className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-600 text-xl font-semibold">기록된 데이터 없음</p>
                            <p className="text-gray-400 text-sm mt-2">모니터링 시스템이 가동 중입니다.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5">
                            {/* ... (이미지 맵핑 내용 유지) ... */}
                            {displayImages.map((img) => (
                                <div
                                    key={img.id}
                                    onClick={() => setSelectedImage(img)}
                                    className={`bg-white border rounded-xl overflow-hidden shadow-lg transition-all duration-300 cursor-pointer group 
                                        ${selectedImage?.id === img.id 
                                            ? 'border-blue-600 ring-4 ring-blue-300 scale-[1.02]' 
                                            : 'border-gray-200 hover:shadow-xl hover:border-blue-200'}`}
                                >
                                    {/* ... 이미지 카드 내부 내용 유지 ... */}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 이미지 상세 모달 (변동 없음) */}
            {selectedImage && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"
                    onClick={() => setSelectedImage(null)}
                >
                    {/* ... (모달 내부 내용 유지) ... */}
                </div>
            )}
        </div>
    );
}

# Game of Ecom - Phase 1+2 deploy
# Rebrand FB Pack Studio -> Game of Ecom + Quest HUD + XP system
$ErrorActionPreference = "Stop"

Write-Host "=== Game of Ecom Deploy ===" -ForegroundColor Magenta

$src = "C:\Users\Admin\Documents\Claude\Projects\DEMAN\fb-pack-studio.html"
$dst = "C:\Users\Admin\Documents\Claude\Projects\DEMAN\fb-pack-studio-deploy\index.html"

Copy-Item -Path $src -Destination $dst -Force
$srcSize = (Get-Item $src).Length
$dstSize = (Get-Item $dst).Length
Write-Host "Synced: $srcSize -> $dstSize bytes" -ForegroundColor Green

# V14.18 — Verify audio bundle present
$audioDir = "C:\Users\Admin\Documents\Claude\Projects\DEMAN\fb-pack-studio-deploy\audio"
if (Test-Path $audioDir) {
    $mp3Count = (Get-ChildItem $audioDir -Filter "*.mp3").Count
    $audioSize = (Get-ChildItem $audioDir -Filter "*.mp3" | Measure-Object Length -Sum).Sum / 1MB
    Write-Host ("Audio bundle: $mp3Count tracks, {0:N1} MB" -f $audioSize) -ForegroundColor Green
} else {
    Write-Host "WARN: audio/ dir missing - music library wont work" -ForegroundColor Yellow
}

# Sanity check GoE markers
$content = Get-Content $dst -Raw
$markers = @(
    'Game of Ecom',
    'QuestHUD',
    'QuestMapModal',
    'WelcomeModal',
    'PricingModal',
    'ProfileModal',
    'LeaderboardModal',
    'PIRATE_AVATARS',
    'Pirate King',
    'East Blue',
    'Bounty',
    'pushBountyToCloud',
    'GAME_BADGES',
    'DAILY_QUESTS',
    'STREAK_MILESTONES',
    'awardXP',
    'fireConfetti',
    'tickDailyQuestProgress',
    '/api/waitlist',
    '/api/profile',
    '/api/leaderboard',
    'ScheduleViewModal',
    'PostTaskBar',
    'POST_STATUS_META',
    'computePostTasks',
    'Captain',
    'goe-btn',
    'goe-card-clay',
    'font-display',
    'Bowlby One',
    '--surface-base',
    '--primary-500',
    'period=week',
    'UploadResourceModal',
    '/api/drive/import_url',
    'extractDriveFileId',
    'AccountPickerModal',
    'overrideAccountId',
    'pack-bound',
    'VaultManagerModal',
    '/api/vault/upload',
    '/api/strategist/analyze',
    '/api/strategist/generate-posts',
    '/api/strategist/extend-day',
    'extractFileText',
    'Knowledge Vault',
    'StrategistRunBanner',
    'StrategistContentBar',
    'massGenerate',
    'extendDay',
    'VideoStudioModal',
    'TimelineTrack',
    'exportTimelineToMP4',
    'encodeAudioToMuxer',
    'mp4-muxer',
    '/api/video/projects',
    '/api/video/export-stage',
    'onOpenStudio',
    'studioExternalMedia',
    'Video Studio',
    'buildTimelineFromPost',
    'collectAssetsForPost',
    'handleAutoBuild',
    'applyBulkImageDuration',
    'fitVideoToAudio',
    'evenSpreadToAudio',
    'handleBatchBuild',
    'Auto Build',
    'Bulk:',
    'Batch ALL',
    'Slide + Music',
    'Cinema + Music',
    '+ Music',
    'kenBurnsEnabled',
    'subtitlesEnabled',
    'masterAudioVolume',
    'drawKenBurns',
    'findSubtitleAtTime',
    'drawSubtitle',
    'syncPreviewAudio',
    'avc1.42E028',
    'detectSrcKind',
    'addManyAssets',
    'Scenes',
    'Chain',
    'Final',
    'imageElCacheRef',
    'videoElCacheRef',
    'lastExportInfo',
    'localBlobUrl',
    'Download lai',
    'Copy URL',
    'Mo Cloud',
    'quickPreviewAsset',
    'studio-export',
    'Vao Timeline',
    'STUDIO EXPORT',
    'AssetLibraryItem',
    'BlobVideoPreview',
    'final_video',
    'FREE_MUSIC_LIBRARY',
    'MUSIC_MOOD_META',
    'pickAutoMusic',
    'fetchAndSaveMusic',
    'MusicLibraryModal',
    '/api/music/fetch',
    'autoMusicEnabled',
    'showMusicLib',
    'Music Library',
    'Auto Music',
    'free-music-library',
    'sortedPacks',
    'onOpenProjects',
    'cloud_synced',
    'useIsMobile',
    'mobileStudioTab',
    'showMobileMenu',
    'showFullscreen',
    'preview-fullscreen',
    'mobile-bottom-sheet',
    'studio-mobile-tab-active',
    'LevelUpModal',
    'spawnXPParticles',
    'goe-level-up',
    'levelUpCelebration',
    'goeMapDash',
    'goeLevelUpZoom',
    'goeFloatUp',
    'GRAND LINE',
    'NEW UNLOCK',
    'fetchAndSaveMusicFromUrl',
    'paste-url',
    'user-upload',
    'trackErrors',
    'handlePasteSubmit',
    'handleFileUpload',
    'freepd.com',
    'videoMasterVol',
    'voiceMasterVol',
    'musicMasterVol',
    'Kevin MacLeod',
    'FreePD',
    'generateBrandStrategyHTML',
    'parseStrategyHTMLImport',
    'goe-pack-data',
    'goe-strategy-1.0',
    'handleExportStrategy',
    'handleImportStrategy',
    'brandFromBody',
    'Smart strategy import',
    'parseStrategyHTMLImport',
    'voiceClips',
    'musicClips',
    'audioPanelH',
    '/audio/chill-01.mp3',
    '/audio/cinematic-01.mp3',
    'self-hosted',
    'Mp4Muxer === ',
    'isConfigSupported',
    'VoicePickerModal',
    'voicePickerState',
    'voiceOverride',
    'chosenVoice',
    'anchored to',
    'splitClipAtPlayhead',
    'Split (S)',
    'cursor-ew-resize',
    'hasMusicAlready',
    'Auto Music ON',
    'encodeQueueSize',
    'Drain queue',
    'Flush timeout',
    'Heavy timeline',
    'voiceHistory',
    'loadFromHistory',
    'onOpenStoryboard',
    'reloadHistory',
    'script_full',
    'previewHistoryId',
    # V14.36 - Create Ad flow + Publish-now
    'CreateAdModal',
    'createAdPost',
    'onCreateAd',
    'onPublishNow',
    'publishingNowId',
    'Create Ad',
    'goe-meta-ad-account-id',
    '/api/zernio-ads/create',
    '/api/zernio-ads/ad-accounts',
    '/api/zernio/publish-now',
    '/api/media/stage',
    # V14.36.1 - Manual paste-tay mode + diagnostic
    'manualMode',
    'manualActId',
    'manualName',
    'manualCurrency',
    'accountsDebug',
    'Paste tay',
    'goe-meta-ad-account-id-manual',
    # V15.0 - Meta Marketing API direct (replaces Zernio Ads)
    '/api/meta-ads/accounts',
    '/api/meta-ads/create',
    '/api/meta-ads/boost',
    '/api/meta-ads/campaigns',
    '/api/meta-ads/toggle',
    'goalToMetaObjective',
    'goalToOptGoal',
    'showPasteGuide',
    'handleExportConfig',
    'can_create_ads',
    'PASTE GUIDE',
    'V15.0',
    'Export Config',
    # V16 - MCP server (Cloudflare Workers, Streamable HTTP)
    'ConnectClaudeModal',
    'showConnectClaude',
    '/api/mcp-keys',
    'game-of-ecom',
    'sk_goe_',
    'Manage MCP keys',
    'mcpUrl',
    'newScopes',
    'V16 MCP'
    # V17 - OAuth 2.1 for Cowork + claude.ai web (no frontend changes)
    # V18 - Full Control MCP (no frontend markers, backend only)
    # V20 - Viral Grid Master strategy layer
    'ViralGridModal',
    'showViralGrid',
    'onOpenViralGrid',
    '/api/viral-grid/run',
    '/api/viral-grid/sessions',
    # V21 - Brand Genesis Studio (unified)
    'Brand Genesis',
    '/api/viral-grid/genesis',
    'runFullGenesis',
    'productType',
    'materializeCount',
    'groundWithVault',
    'Full Brand Genesis Mode',
    # V21.1 - Unified entry + upload auto-fill
    'handleUploadFile',
    'parsingFile',
    'uploadedFile',
    'AI auto-fill',
    'Start Brand Genesis',
    # V21.2 - Browser-side Gemini call (bypass CF edge geo-block)
    'callGeminiBrowser',
    '/api/viral-grid/persist-session',
    '/api/viral-grid/materialize-skills',
    'bypass Cloudflare',
    # V22 - Voice-Over Production Engine (doctor-stone-video-engine pattern)
    'VoiceProductionModal',
    'showProduction',
    'productionPost',
    'onOpenProduction',
    '/api/production/render-pack-html',
    'VO Pack',
    'gemini-omni-flash',
    'Nano Banana Pro 3',
    # V22.9 - Director-grade 8-frame storyboard
    'V22.9',
    'Director 8-Frame Breakdown',
    'AUTHORITATIVE 8-BEAT TIMELINE',
    # V23.0 - Mobile command center UX
    'V23.0',
    'Mobile command center UX',
    'welcome-onboarding-card',
    'mobile-mode-strip',
    # V23.1/V23.2 - Mobile overflow + toast-fit polish
    'V23.1',
    'postcard-prompt-actions',
    'V23.2',
    'mobile-toast-shell',
    # V23.3 - Deep Strategy Mode pack-first fallback (safe JSON fetch + local IDB pack)
    'V23.3',
    'Deep Strategy Mode (Beta)',
    'safeJsonFetch'
)
foreach ($m in $markers) {
    if ($content -notmatch [regex]::Escape($m)) {
        Write-Host "WARN missing: $m" -ForegroundColor Yellow
    } else {
        Write-Host "OK: $m" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Applying schema_v13_video.sql (D1 video_projects) ===" -ForegroundColor Magenta
Set-Location "C:\Users\Admin\Documents\Claude\Projects\DEMAN\fb-pack-studio-deploy"
try {
    npx wrangler d1 execute fb-pack-studio-db --file=schema_v13_video.sql --remote 2>&1 | Out-Host
    Write-Host "Schema v13 applied (or already existed)" -ForegroundColor Green
} catch {
    Write-Host "Schema v13 step warning: $_" -ForegroundColor Yellow
}

# V15.0 - Meta Marketing API schema (user_access_token + ads_log)
Write-Host ""
Write-Host "=== Applying schema_v15_meta_ads.sql (D1 user_access_token + ads_log) ===" -ForegroundColor Magenta
try {
    npx wrangler d1 execute fb-pack-studio-db --file=schema_v15_meta_ads.sql --remote 2>&1 | Out-Host
    Write-Host "Schema v15 applied" -ForegroundColor Green
} catch {
    Write-Host "Schema v15 step warning: $_ (column may already exist)" -ForegroundColor Yellow
}

# V16 - MCP server schema (mcp_api_keys + mcp_call_log)
Write-Host ""
Write-Host "=== Applying schema_v16_mcp.sql (D1 mcp_api_keys + mcp_call_log) ===" -ForegroundColor Magenta
try {
    npx wrangler d1 execute fb-pack-studio-db --file=schema_v16_mcp.sql --remote 2>&1 | Out-Host
    Write-Host "Schema v16 applied" -ForegroundColor Green
} catch {
    Write-Host "Schema v16 step warning: $_ (table may already exist)" -ForegroundColor Yellow
}

# V17 - OAuth 2.1 schema (oauth_clients + oauth_codes + columns on mcp_api_keys)
Write-Host ""
Write-Host "=== Applying schema_v17_oauth.sql (D1 oauth_clients + oauth_codes) ===" -ForegroundColor Magenta
try {
    npx wrangler d1 execute fb-pack-studio-db --file=schema_v17_oauth.sql --remote 2>&1 | Out-Host
    Write-Host "Schema v17 applied" -ForegroundColor Green
} catch {
    Write-Host "Schema v17 step warning: $_ (columns may already exist)" -ForegroundColor Yellow
}

# V18 - Full Control schema (render_jobs queue)
Write-Host ""
Write-Host "=== Applying schema_v18_full_control.sql (D1 render_jobs) ===" -ForegroundColor Magenta
try {
    npx wrangler d1 execute fb-pack-studio-db --file=schema_v18_full_control.sql --remote 2>&1 | Out-Host
    Write-Host "Schema v18 applied" -ForegroundColor Green
} catch {
    Write-Host "Schema v18 step warning: $_ (table may already exist)" -ForegroundColor Yellow
}

# V20 - Viral Grid Master schema
Write-Host ""
Write-Host "=== Applying schema_v20_viral_grid.sql (D1 viral_grid_sessions) ===" -ForegroundColor Magenta
try {
    npx wrangler d1 execute fb-pack-studio-db --file=schema_v20_viral_grid.sql --remote 2>&1 | Out-Host
    Write-Host "Schema v20 applied" -ForegroundColor Green
} catch {
    Write-Host "Schema v20 step warning: $_ (table or columns may already exist)" -ForegroundColor Yellow
}

# V21 - Brand Genesis Studio schema (product_type + spawned_artifacts)
Write-Host ""
Write-Host "=== Applying schema_v21_brand_genesis.sql (D1 spawned_artifacts) ===" -ForegroundColor Magenta
try {
    npx wrangler d1 execute fb-pack-studio-db --file=schema_v21_brand_genesis.sql --remote 2>&1 | Out-Host
    Write-Host "Schema v21 applied" -ForegroundColor Green
} catch {
    Write-Host "Schema v21 step warning: $_ (columns may already exist)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Deploying ===" -ForegroundColor Magenta
npx wrangler pages deploy . --project-name=fb-pack-studio --branch=main --commit-dirty=true

Write-Host ""
Write-Host "=== Game of Ecom deployed ===" -ForegroundColor Magenta
Write-Host "Test checklist:" -ForegroundColor Cyan
Write-Host "  1. Mo URL pages.dev - title 'Game of Ecom'"
Write-Host "  2. Goc tren phai QuestHUD hien Level + XP bar"
Write-Host "  3. Click QuestHUD -> Quest Map 4 quest"
Write-Host "  4. New pack +50 XP First Pack toast"
Write-Host "  5. Generate anh +5 XP"
Write-Host "  6. Sign in Google Drive +30 XP Quest 3"
Write-Host "  7. Publish via Zernio +150 XP Quest 4"
Write-Host "  8. Header Studio button mau tim - mo Video Studio"
Write-Host "  9. New Project - keo asset vao timeline - Export MP4"
Write-Host " 10. Sau export click Publish via Zernio - stage R2 + publish"
Write-Host " 11. Studio toolbar Auto Build - chon Day - Slide+Music hoac Cinema+Music"
Write-Host " 12. Bulk Img Xs Enter set all image durations"
Write-Host " 13. Fit video to audio / Even spread"
Write-Host " 14. Batch ALL tao project cho tat ca posts"
Write-Host " 15. Nut + Music upload nhac nen MP3/WAV 30MB"
Write-Host " 16. Master volume + Ken Burns + Subs toggles"
Write-Host " 17. Preview Play nghe duoc audio"
Write-Host " 18. Clip Inspector audio clip co volume slider"
Write-Host " 19. Export MP4 1080p hoat dong AVC level 4.0"
Write-Host " 20. V14.4 asset filter dung - Scene=storyboard Chain=video+sequenceN"
Write-Host " 21. V14.4 Day count + 5 bulk add buttons Scenes Image Chain Final Voice+Music"
Write-Host " 22. V14.4 Preview canvas force-rerender khi timeline thay doi"
Write-Host " 23. V14.5 Preview smooth - image/video preload cached khi tracks thay doi"
Write-Host " 24. V14.5 Sau Export MP4 - auto download ve Downloads folder + R2 stage"
Write-Host " 25. V14.5 Export panel xanh la - Download lai / Copy URL / Mo Cloud / Publish"
Write-Host " 26. V14.6 Sau export MP4 tu dong vao Library voi badge STUDIO + filter Final"
Write-Host " 27. V14.6 Hover thumbnail video -> tu phat preview; Click -> mo modal lon"
Write-Host " 28. V14.6 Quick Preview modal: full video player + Vao Timeline + Download"
Write-Host " 29. V14.7 AssetLibrary thumbnail dung blob URL - video 22MB hien duoc"
Write-Host " 30. V14.7 PreviewPane tab Final auto-detect studio-export + chain-export"
Write-Host " 31. V14.7 Sau export trong Studio - PostCard PreviewPane auto-refresh moi"
Write-Host " 32. V14.8 Nut Music Library xanh - browse 10 tracks free CC0 theo 6 mood"
Write-Host " 33. V14.8 Preview play test nhac - Dung nhac nay tu fetch + save bgm + add timeline"
Write-Host " 34. V14.8 Toggle Auto Music - khi ON, master buttons tu pick nhac theo brand voice + mode"
Write-Host " 35. V14.8 Slide mode->chill, Cinema->upbeat, Voice warm->chill, professional->corporate v.v."
Write-Host " 36. V14.9 Demo button removed - khong con nut Try the demo - Load ONIIZ Pack"
Write-Host " 37. V14.9 Welcome screen hien grid 12 du an gan day - click mo lai workspace"
Write-Host " 38. V14.9 New Pack -> ve welcome - thay grid du an luon - khong bi mat huong"
Write-Host " 39. V14.11 Mobile: AppHeader thu gon - cac nut phu nam trong nut ham burger"
Write-Host " 40. V14.11 Mobile: Studio modal hien tab nav Library/Preview/Timeline thay 3-panel"
Write-Host " 41. V14.11 Mobile: Inspector clip thanh bottom-sheet slide-up"
Write-Host " 42. V14.11 Mobile: PreviewPane co nut Xem to - mo fullscreen"
Write-Host " 43. V14.11 Mobile: input field 16px tranh iOS zoom, touch target 40px"
Write-Host " 44. V14.12 A: Quest Map co SVG ocean voyage 5 islands + ship sailing + dotted path"
Write-Host " 45. V14.12 B: Up level -> full-screen overlay vang gradient + confetti tiered + Bowlby title"
Write-Host " 46. V14.12 C: Bat ki action gain XP -> hat vang bay tu click point ve QuestHUD goc phai"
Write-Host " 47. V14.13 Music Library: 3 tabs - Curated / Paste URL / Upload File"
Write-Host " 48. V14.13 Track curated fail -> hien error inline + retry"
Write-Host " 49. V14.13 Paste URL: input + Fetch button (Pixabay/Mixkit/Archive whitelist)"
Write-Host " 50. V14.13 Upload File: drag MP3/WAV/OGG max 30MB - skip proxy 100%"
Write-Host " 51. V14.14 9/10 curated tracks switched to freepd.com (Kevin MacLeod CC0 stable)"
Write-Host " 52. V14.14 3 master volume sliders rieng: video / voice / music"
Write-Host " 53. V14.14 Music clip mau purple - voice clip mau green trong timeline"
Write-Host " 54. V14.14 Export MP4 voice = clipVol x voiceMaster, music = clipVol x musicMaster"
Write-Host " 55. V14.23 Voice picker pack-wide - khi post chua co voice se show TAT CA voice trong pack voi tag 'from Day X'"
Write-Host " 56. V14.23 Empty state - pack 0 voice -> hien CTA Build silent + huong dan toi PostCard gen voice"
Write-Host " 57. V14.23 R2 upload timeout 90s - fail -> toast warn nhung file MP4 da o Downloads"
Write-Host " 58. V14.23 File > 95MB -> skip R2 upload luon, dung local-only de tranh Workers 100MB limit"
Write-Host " 59. V14.25 Zernio publish ho tro TikTok - accounts.js tra ca FB + TikTok accounts"
Write-Host " 60. V14.25 ZernioPublishModal hien platform badge - mau hong cho TikTok, xanh cho FB"
Write-Host " 61. V14.25 TikTok publish chan client-side neu khong co video - bao loi hop ly"
Write-Host " 62. V14.25 pickAutoMusic + buildPostBody nhan parameter platform - auto-detect tu selected account"
Write-Host " 63. V14.25 AccountPickerModal hien tat ca account voi platform badge (FB / TT)"
Write-Host " 64. V14.26 Hybrid Auto Build - nut hong 'Hybrid + Music' mix raw video + storyboard"
Write-Host " 65. V14.26 Upload Raw Footage - chon type 'Raw Footage' trong UploadResourceModal"
Write-Host " 66. V14.26 Raw video pack-wide - de target post = Khong gan -> dung chung pack"
Write-Host " 67. V14.26 Gemini shot-list endpoint - /api/studio/hybrid-shotlist quyet dinh slot nao swap"
Write-Host " 68. V14.26 Toast Hybrid: build XYZ + AI mixed N raw + M storyboard"
Write-Host " 69. V14.27 Auto-Schedule All - nut xanh 'Auto-Schedule' canh Logbook"
Write-Host " 70. V14.27 Modal liet ke post du dieu kien (co anh + chua scheduled/published)"
Write-Host " 71. V14.27 Schedule time auto: Day 1 = start_date, Day N = start_date + (N-1) ngay @ best_time hoac bulk time"
Write-Host " 72. V14.27 Loop client-side qua /api/zernio/publish, hien progress bar tung post"
Write-Host " 73. V14.27 Hien thanh phan platform (FB/TT) - bulk override account dropdown"
Write-Host " 74. V14.27 Trang thai duoc cap nhat tu dong qua Captain's Logbook"
Write-Host " 75. V14.28 Preview Voice button trong VoiceGenModal - gen 1 cau mau truoc khi gen full"
Write-Host " 76. V14.29 Video templates - 5 overlay (lower-third, news-ticker, product-callout, CTA-strip, brand-corner)"
Write-Host " 77. V14.29 Template dropdown trong Studio toolbar canh Ken Burns/Subs - hien preview live"
Write-Host " 78. V14.30 Storyboard prompt: word-cap 6-18 action / 20-50 visual / 40-80 prompt + post-validate warn"
Write-Host " 79. V14.31 Script splitter trong VoiceGenModal - chia text theo cau/dong/doan voi live preview"
Write-Host " 80. V14.32 Lyria AI music toggle - canh Auto Music, default OFF (cost ~3.60USD/post)"
Write-Host " 81. V14.32 lyriaGenerateMusic helper - WebSocket Gemini Live API, collect 60s PCM 24kHz mono"
Write-Host " 82. V14.32 Mood-aware prompt builder - voice style + brand voice + mode -> Lyria text prompt"
Write-Host " 83. V14.32 Confirm dialog truoc khi gen Lyria (avoid surprise cost) + auto-fallback Mixkit khi fail"
Write-Host " 84. V14.33 BulkCancel scheduled posts - /api/zernio/cancel endpoint"
Write-Host " 85. V14.33 Logbook: nut Huy lich per row + checkbox bulk select + nut 'Chon tat ca scheduled'"
Write-Host " 86. V14.33 Confirm dialog truoc khi cancel + auto-skip published posts"
Write-Host " 87. V14.34 Mess Sales Wizard - skill fb-ads-mess-30day-pack vao app"
Write-Host " 88. V14.34 Nut mau red-orange 'Mess Sales 30d' canh 'San xuat 30 ngay' trong Strategist bar"
Write-Host " 89. V14.34 8-cau intake form + live forecast math (red/yellow/green feasibility)"
Write-Host " 90. V14.34 Backend /api/strategist/mess-sales-pack - 9 industries voi CPL benchmark"
Write-Host " 91. V14.34 Mess-keyword UNIQUE per post + auto-dedupe + campaign_config JSON output"
Write-Host " 92. V14.34 Import posts vao pack + download JSON + copy campaign config buttons"
Write-Host " 93. V14.34.1 FIX Gemini 400 'User location not supported' - default gemini-2.5-flash + fallback chain"
Write-Host " 94. V14.34.1 Forecast labels ro hon - 2-card layout: DE DAT TARGET (rose) vs VOI BUDGET (emerald)"
Write-Host " 95. V14.34.1 Reasoning explicit hon: nay can XXM de dat YY leads, nhung chi co ZZM -> realistic AA"
Write-Host " 96. V14.35 Zernio Meta Ads integration - 3 endpoints (list/boost/toggle) qua /api/zernio-ads/*"
Write-Host " 97. V14.35 MetaAdsManagerModal - list campaigns + pause/resume/edit budget/delete"
Write-Host " 98. V14.35 BoostAdsModal - 1-click boost post: goal + budget/day + duration + targeting"
Write-Host " 99. V14.35 Header nut 'Meta Ads' xanh dam canh Auto-Schedule (chi hien khi Zernio connected)"
Write-Host "100. V14.35 Tien duong cho V9.5 - Boost Ads integration (Marketing API via Zernio)"
Write-Host "101. V14.34.2 BULLETPROOF Mess Sales gen - bypass CF Worker, call Gemini DIRECT tu browser"
Write-Host "102. V14.34.2 IP browser = VN user IP -> Gemini chap nhan 100%, het 'User location' 400 error"
Write-Host "103. V14.34.2 Forecast math + campaign_config compute client-side, ko can backend"
Write-Host "104. V14.34.3 Import workspace - 3 nut: Tao PACK MOI (default) / APPEND / REPLACE"
Write-Host "105. V14.34.3 New pack auto-named '[brand] · Mess Sales 30d · YYYY-MM-DD' voi mess_sales metadata"
Write-Host "106. V14.34.3 Auto-switch sang pack moi sau khi import - workspace doc lap edit + run ads"
Write-Host "107. V14.35.1 Meta Ads button luon hien (bo gate zernioConnected) - pulse animation"
Write-Host "108. V14.35.1 Diagnostic panel hien raw API response khi 0 ads hoac error - debug nhanh"
Write-Host "109. V14.35.1 Nut Boost Ads xuat hien tren TUNG scheduled + published post trong Logbook"
Write-Host "110. V14.35.1 Click Boost -> mo BoostAdsModal voi budget/duration/targeting picker"
Write-Host "111. V14.35.2 FIX Zernio 400 missing_required_field - them accountId (Zernio internal) auto-resolve"
Write-Host "112. V14.35.2 Auto-prefix act_ neu user paste chi so cho Meta Ad Account ID"
Write-Host "113. V14.35.2 Error panel hien full Zernio response + payload sent cho debug nhanh"
Write-Host "114. V14.35.2 Boost button DISABLED cho scheduled status - chi enable khi post published"
Write-Host "115. V14.35.2 Warning banner trong BoostAdsModal neu post chua live tren FB"
Write-Host "116. V14.35.2 Giai thich Meta subcode 2446289 = post not eligible (chua publish)"
Write-Host "117. V14.35.3 Multi-endpoint fallback chain: /ads/create -> /ads/boost -> /posts/{id}/boost"
Write-Host "118. V14.35.3 Attempts log hien trong error panel - thay path nao fail/success"
Write-Host "119. V14.35.3 Workaround tip: dung Zernio dashboard manual neu API fail"

<?php
/**
 * Codecastic GH - High-Performance Native PHP API Bridge
 * 
 * Directly serves all /api/* requests for ExamHub, candidate portal,
 * and admin dashboard using data/db.json.
 */

// Enable CORS and JSON headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// -------------------------------------------------------------
// Database Path & Helpers
// -------------------------------------------------------------
$dataDir = __DIR__ . '/data';
$dbFile = $dataDir . '/db.json';

function getDb() {
    global $dataDir, $dbFile;
    if (!file_exists($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    
    // Check if db.json exists
    if (!file_exists($dbFile)) {
        $seedFile = $dataDir . '/seed.json';
        if (file_exists($seedFile)) {
            copy($seedFile, $dbFile);
        } else {
            $initial = [
                'subjects' => [],
                'questions' => [],
                'settings' => [],
                'users' => [],
                'sessions' => [],
                'results' => [],
                'messages' => []
            ];
            file_put_contents($dbFile, json_encode($initial, JSON_PRETTY_PRINT));
            return $initial;
        }
    }
    $raw = file_get_contents($dbFile);
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = [];
    }
    foreach (['subjects', 'questions', 'settings', 'users', 'sessions', 'results', 'messages'] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key])) {
            $data[$key] = [];
        }
    }

    // Smart-merge newly added questions from seed.json without touching candidates/results
    $seedFile = $dataDir . '/seed.json';
    if (file_exists($seedFile)) {
        $seedRaw = file_get_contents($seedFile);
        $seedData = json_decode($seedRaw, true);
        if (is_array($seedData) && !empty($seedData['questions'])) {
            $existingQIds = [];
            foreach ($data['questions'] as $eq) {
                if (!empty($eq['id'])) $existingQIds[$eq['id']] = true;
            }
            $added = 0;
            foreach ($seedData['questions'] as $sq) {
                if (!empty($sq['id']) && !isset($existingQIds[$sq['id']])) {
                    $data['questions'][] = $sq;
                    $existingQIds[$sq['id']] = true;
                    $added++;
                }
            }
            if ($added > 0) {
                saveDb($data, false);
            }
        }
    }

    return $data;
}

function saveDb($data, $makeBackup = true) {
    global $dataDir, $dbFile;
    if (!file_exists($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $tmpFile = $dbFile . '.tmp.' . uniqid();
    file_put_contents($tmpFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmpFile, $dbFile);

    // Automatic rolling daily backup to protect candidate records permanently
    if ($makeBackup) {
        $backupDir = $dataDir . '/backups';
        if (!file_exists($backupDir)) {
            @mkdir($backupDir, 0755, true);
        }
        $todayBackup = $backupDir . '/db-backup-' . date('Y-m-d') . '.json';
        if (!file_exists($todayBackup)) {
            @copy($dbFile, $todayBackup);
        }
    }
}

function generateUuid() {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function jsonOut($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function errorOut($message, $code = 400) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonBody() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// -------------------------------------------------------------
// Level Normalization & Defaults
// -------------------------------------------------------------
$SCHOOL_LEVELS = [4, 5, 6, 7, 8, 9];
$SHS_LEVELS = ['SHS 1', 'SHS 2', 'SHS 3'];
$TRACKS = ['BECE', 'WASSCE', 'GTLE', 'GES-PROMO'];

function normLevel($raw) {
    global $SCHOOL_LEVELS, $SHS_LEVELS, $TRACKS;
    $s = trim((string)$raw);
    if ($s === '') return null;
    if (ctype_digit($s)) {
        $n = (int)$s;
        return in_array($n, $SCHOOL_LEVELS, true) ? $n : null;
    }
    if (preg_match('/^(?:basic|grade|class|b)\s*(\d+)$/i', $s, $m)) {
        $n = (int)$m[1];
        return in_array($n, $SCHOOL_LEVELS, true) ? $n : null;
    }
    if (preg_match('/^(?:shs|form)\s*([1-3])$/i', $s, $m)) {
        return 'SHS ' . $m[1];
    }
    $u = strtoupper($s);
    if ($u === 'SHS' || $u === 'SHS 1 - 3' || $u === 'SHS 1-3') return 'SHS 1';
    if ($u === 'GES PROMOTION' || $u === 'GES PROMOTION EXAMS' || $u === 'GES-PROMOTION') return 'GES-PROMO';
    if (in_array($u, $SHS_LEVELS, true)) return $u;
    if (in_array($u, $TRACKS, true)) return $u;
    return null;
}

$DEFAULT_TIMERS = [
    'ges-promotion' => 45,
    'basic' => 30,
    'bece' => 45,
    'shs' => 45,
    'wassce' => 60,
    'gtle' => 60,
];

$PROMOTION_RANK_ITEMS = [
    ['id' => 'rank-ad-ii', 'name' => 'Assistant Director II (AD II)'],
    ['id' => 'rank-ad-i', 'name' => 'Assistant Director I (AD I)'],
    ['id' => 'rank-dd', 'name' => 'Deputy Director (DD)'],
    ['id' => 'rank-dir-ii', 'name' => 'Director II (Dir II)'],
    ['id' => 'rank-dir-i', 'name' => 'Director I (Dir I)'],
];

// -------------------------------------------------------------
// Auth & User Helpers
// -------------------------------------------------------------
function publicUser($u) {
    return [
        'id' => (string)($u['id'] ?? ''),
        'name' => (string)($u['name'] ?? ''),
        'email' => (string)($u['email'] ?? ''),
        'accountType' => ($u['accountType'] ?? '') === 'ges-promo' ? 'ges-promo' : 'student',
        'schoolName' => (string)($u['schoolName'] ?? ''),
        'gradeLevel' => $u['gradeLevel'] ?? 4,
        'region' => (string)($u['region'] ?? ''),
        'promotionRank' => (string)($u['promotionRank'] ?? '')
    ];
}

function getUserByToken($db, $token) {
    if (!$token || !is_string($token)) return null;
    $sess = null;
    foreach ($db['sessions'] as $s) {
        if (isset($s['token']) && $s['token'] === $token) {
            $sess = $s;
            break;
        }
    }
    if (!$sess) return null;
    foreach ($db['users'] as $u) {
        if (isset($u['id']) && $u['id'] === $sess['userId']) {
            return $u;
        }
    }
    return null;
}

function getAdminCode($db) {
    foreach ($db['settings'] as $s) {
        if (isset($s['key']) && $s['key'] === 'admin') {
            return $s['passcode'] ?? null;
        }
    }
    return null;
}

function isAdmin($db, $code) {
    $saved = getAdminCode($db);
    return !empty($saved) && is_string($code) && $code === $saved;
}

function getInboxCode($db) {
    foreach ($db['settings'] as $s) {
        if (isset($s['key']) && $s['key'] === 'inbox') {
            return $s['passcode'] ?? null;
        }
    }
    return null;
}

function isStaff($db, $code) {
    $saved = getInboxCode($db);
    return !empty($saved) && is_string($code) && $code === $saved;
}

function verifyUserPassword($password, $user) {
    if (!empty($user['passwordPlain']) && $user['passwordPlain'] === $password) {
        return true;
    }
    if (!empty($user['passwordHash'])) {
        $hash = $user['passwordHash'];
        if (strpos($hash, '$2y$') === 0 || strpos($hash, '$2a$') === 0) {
            return password_verify($password, $hash);
        }
    }
    return false;
}

// -------------------------------------------------------------
// Route Parsing
// -------------------------------------------------------------
$route = '';
if (isset($_GET['route'])) {
    $route = trim($_GET['route'], '/');
} else {
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (strpos($uriPath, '/api/') === 0) {
        $route = trim(substr($uriPath, 5), '/');
    } elseif ($uriPath === '/api') {
        $route = '';
    }
}
$method = $_SERVER['REQUEST_METHOD'];

$db = getDb();

// -------------------------------------------------------------
// Route Handlers
// -------------------------------------------------------------

// Healthcheck
if ($route === '_healthcheck' && $method === 'GET') {
    jsonOut(['status' => 'ok', 'message' => 'Codecastic API is running']);
}

// Public Subjects
if ($route === 'subjects' && $method === 'GET') {
    $subs = $db['subjects'];
    usort($subs, function($a, $b) {
        return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
    });
    jsonOut(['subjects' => $subs]);
}

// Question Counts
if ($route === 'counts' && $method === 'GET') {
    $qs = $db['questions'];
    $counts = [];
    $yearsMap = [];
    $categoriesMap = [];
    $yearCounts = [];
    $categoryCounts = [];

    foreach ($qs as $q) {
        $key = ($q['subjectId'] ?? '') . '|' . ($q['level'] ?? '');
        $counts[$key] = ($counts[$key] ?? 0) + 1;
        
        $yr = trim((string)($q['year'] ?? ''));
        if ($yr !== '') {
            if (!isset($yearsMap[$key])) $yearsMap[$key] = [];
            if (!in_array($yr, $yearsMap[$key], true)) $yearsMap[$key][] = $yr;
            $yKey = $key . '|' . $yr;
            $yearCounts[$yKey] = ($yearCounts[$yKey] ?? 0) + 1;
        }

        $cat = trim((string)($q['category'] ?? ''));
        if ($cat !== '') {
            if (!isset($categoriesMap[$key])) $categoriesMap[$key] = [];
            if (!in_array($cat, $categoriesMap[$key], true)) $categoriesMap[$key][] = $cat;
            $cKey = $key . '|' . $cat;
            $categoryCounts[$cKey] = ($categoryCounts[$cKey] ?? 0) + 1;
        }
    }
    jsonOut([
        'counts' => $counts,
        'yearsMap' => $yearsMap,
        'categoriesMap' => $categoriesMap,
        'yearCounts' => $yearCounts,
        'categoryCounts' => $categoryCounts
    ]);
}

// Exam Timers
if ($route === 'exam/timers' && $method === 'GET') {
    global $DEFAULT_TIMERS;
    $timers = $DEFAULT_TIMERS;
    foreach ($db['settings'] as $s) {
        if (isset($s['key']) && $s['key'] === 'exam_timers' && !empty($s['timers'])) {
            $timers = array_merge($timers, $s['timers']);
            break;
        }
    }
    jsonOut(['timers' => $timers]);
}

// Admin Timers
if ($route === 'admin/timers' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    
    global $DEFAULT_TIMERS;
    $current = $DEFAULT_TIMERS;
    $idx = null;
    foreach ($db['settings'] as $i => $s) {
        if (isset($s['key']) && $s['key'] === 'exam_timers') {
            $current = array_merge($current, $s['timers'] ?? []);
            $idx = $i;
            break;
        }
    }
    $inputTimers = is_array($b['timers'] ?? null) ? $b['timers'] : [];
    foreach ($inputTimers as $k => $v) {
        $num = (int)$v;
        if ($num > 0 && $num <= 360) {
            $current[$k] = $num;
        }
    }
    if ($idx !== null) {
        $db['settings'][$idx]['timers'] = $current;
        $db['settings'][$idx]['updatedAt'] = round(microtime(true) * 1000);
    } else {
        $db['settings'][] = [
            'id' => generateUuid(),
            'key' => 'exam_timers',
            'timers' => $current,
            'updatedAt' => round(microtime(true) * 1000)
        ];
    }
    saveDb($db);
    jsonOut(['ok' => true, 'timers' => $current]);
}

// Exam Fetch: exam/:level/:subjectId
if (preg_match('#^exam/([^/]+)/([^/]+)$#', $route, $matches) && $method === 'GET') {
    $rawLevel = urldecode($matches[1]);
    $subjectId = urldecode($matches[2]);
    $level = normLevel($rawLevel);
    if ($level === null) errorOut('Invalid level', 400);

    $allQs = [];
    foreach ($db['questions'] as $q) {
        if (($q['subjectId'] ?? '') === $subjectId && ($q['level'] ?? '') == $level) {
            $allQs[] = $q;
        }
    }

    $yearParam = $_GET['year'] ?? '';
    $catParam = $_GET['category'] ?? '';
    $limitParam = (int)($_GET['limit'] ?? 0);
    $backfillParam = ($_GET['backfill'] ?? '') === 'true';

    $filtered = $allQs;
    if ($yearParam !== '' && $yearParam !== 'all') {
        $filtered = array_filter($filtered, function($q) use ($yearParam) {
            return trim((string)($q['year'] ?? '')) === trim($yearParam);
        });
    }
    if ($catParam !== '' && $catParam !== 'all') {
        $filtered = array_filter($filtered, function($q) use ($catParam) {
            return strcasecmp(trim((string)($q['category'] ?? '')), trim($catParam)) === 0;
        });
    }
    $filtered = array_values($filtered);

    // Backfill if needed
    if ($backfillParam && $limitParam > 0 && count($filtered) < $limitParam && count($allQs) > count($filtered)) {
        $seen = [];
        foreach ($filtered as $fq) $seen[$fq['id'] ?? ''] = true;
        foreach ($allQs as $aq) {
            if (!isset($seen[$aq['id'] ?? ''])) {
                $filtered[] = $aq;
                $seen[$aq['id'] ?? ''] = true;
                if (count($filtered) >= $limitParam) break;
            }
        }
    }

    // Limit questions
    if ($limitParam > 0 && count($filtered) > $limitParam) {
        $filtered = array_slice($filtered, 0, $limitParam);
    }

    // Return questions with correctIndex & explanation so interactive client can grade and explain
    $safeQuestions = [];
    foreach ($filtered as $q) {
        $safeQuestions[] = [
            'id' => $q['id'] ?? '',
            'subjectId' => $q['subjectId'] ?? '',
            'level' => $q['level'] ?? '',
            'text' => $q['text'] ?? '',
            'options' => $q['options'] ?? [],
            'correctIndex' => isset($q['correctIndex']) ? (int)$q['correctIndex'] : 0,
            'explanation' => (string)($q['explanation'] ?? ''),
            'year' => $q['year'] ?? null,
            'category' => $q['category'] ?? null
        ];
    }

    jsonOut(['questions' => $safeQuestions]);
}

// Exam Submit
if ($route === 'exam/submit' && $method === 'POST') {
    $b = getJsonBody();
    $rawLevel = $b['level'] ?? '';
    $level = normLevel($rawLevel);
    if ($level === null) errorOut('Invalid level', 400);

    // Resolve user from token or payload
    $u = getUserByToken($db, $b['token'] ?? null);
    $userId = $u ? (string)$u['id'] : trim((string)($b['userId'] ?? ''));
    $studentName = $u ? (string)$u['name'] : trim((string)($b['studentName'] ?? 'Candidate'));
    $studentEmail = $u ? (string)$u['email'] : trim((string)($b['studentEmail'] ?? ''));
    $schoolName = $u ? (string)($u['schoolName'] ?? '') : trim((string)($b['schoolName'] ?? ''));

    $subjId = (string)($b['subjectId'] ?? '');
    $subjectName = trim((string)($b['subjectName'] ?? ''));
    if ($subjectName === '' && $subjId !== '') {
        foreach ($db['subjects'] as $s) {
            if (($s['id'] ?? '') === $subjId) {
                $subjectName = (string)($s['name'] ?? '');
                break;
            }
        }
    }

    $answers = is_array($b['answers'] ?? null) ? $b['answers'] : [];
    $allQsMap = [];
    foreach ($db['questions'] as $q) {
        if (isset($q['id'])) {
            $allQsMap[$q['id']] = $q;
        }
    }

    $questionIds = is_array($b['questionIds'] ?? null) ? $b['questionIds'] : array_keys($answers);
    if (empty($questionIds)) {
        $questionIds = array_keys($answers);
    }

    $score = 0;
    $details = [];
    $review = [];

    foreach ($questionIds as $qid) {
        if (!isset($allQsMap[$qid])) continue;
        $q = $allQsMap[$qid];
        $selected = isset($answers[$qid]) ? $answers[$qid] : null;
        $correct = (int)($q['correctIndex'] ?? 0);
        $isCorrect = ($selected !== null && (int)$selected === $correct);
        if ($isCorrect) $score++;

        $detailItem = [
            'questionId' => $qid,
            'id' => $qid,
            'text' => $q['text'] ?? '',
            'options' => $q['options'] ?? [],
            'selected' => $selected,
            'chosen' => $selected,
            'correctIndex' => $correct,
            'isCorrect' => $isCorrect,
            'correct' => $isCorrect,
            'explanation' => $q['explanation'] ?? '',
            'year' => $q['year'] ?? null,
            'category' => $q['category'] ?? null
        ];
        $details[] = $detailItem;
        $review[] = [
            'id' => $qid,
            'correctIndex' => $correct,
            'chosen' => $selected,
            'correct' => $isCorrect,
            'explanation' => $q['explanation'] ?? '',
            'text' => $q['text'] ?? '',
            'options' => $q['options'] ?? []
        ];
    }

    $totalQuestions = count($questionIds) > 0 ? count($questionIds) : count($details);
    $percent = $totalQuestions > 0 ? round(($score / $totalQuestions) * 100) : 0;
    $passed = $percent >= 50;

    $now = round(microtime(true) * 1000);
    $resultRecord = [
        'id' => generateUuid(),
        'userId' => $userId,
        'studentName' => $studentName,
        'studentEmail' => $studentEmail,
        'schoolName' => $schoolName,
        'level' => $level,
        'subjectId' => $subjId,
        'subjectName' => $subjectName,
        'score' => $score,
        'total' => $totalQuestions,
        'totalQuestions' => $totalQuestions,
        'percent' => $percent,
        'passed' => $passed,
        'details' => $details,
        'createdAt' => $now
    ];

    $db['results'][] = $resultRecord;
    saveDb($db);

    jsonOut([
        'result' => $resultRecord,
        'score' => $score,
        'total' => $totalQuestions,
        'totalQuestions' => $totalQuestions,
        'percent' => $percent,
        'passed' => $passed,
        'review' => $review,
        'details' => $details
    ]);
}

// Student Exam History
if ($route === 'student/history' && $method === 'POST') {
    $b = getJsonBody();
    $tokenUser = getUserByToken($db, $b['token'] ?? null);
    $userId = $tokenUser ? (string)$tokenUser['id'] : trim((string)($b['userId'] ?? ''));
    $email = strtolower(trim((string)($tokenUser ? $tokenUser['email'] : ($b['studentEmail'] ?? ''))));
    $name = strtolower(trim((string)($tokenUser ? $tokenUser['name'] : ($b['studentName'] ?? ''))));

    $matched = [];
    foreach ($db['results'] as $r) {
        $rUserId = trim((string)($r['userId'] ?? ''));
        $rEmail = strtolower(trim((string)($r['studentEmail'] ?? '')));
        $rName = strtolower(trim((string)($r['studentName'] ?? '')));
        $isMatch = false;
        if ($userId !== '' && $rUserId === $userId) $isMatch = true;
        if ($email !== '' && $rEmail === $email) $isMatch = true;
        if ($name !== '' && $rName === $name) $isMatch = true;
        if ($isMatch) {
            $matched[] = $r;
        }
    }

    usort($matched, function($a, $b) {
        return ($b['createdAt'] ?? 0) - ($a['createdAt'] ?? 0);
    });

    $count = count($matched);
    $totalScore = 0;
    $passedCount = 0;
    $bestPercent = 0;
    foreach ($matched as $m) {
        $p = (int)($m['percent'] ?? 0);
        $totalScore += $p;
        if ($p > $bestPercent) $bestPercent = $p;
        if ($p >= 50) $passedCount++;
    }
    $avgPercent = $count > 0 ? round($totalScore / $count) : 0;
    $passRate = $count > 0 ? round(($passedCount / $count) * 100) : 0;

    $recentResults = array_slice($matched, 0, 25);
    $mappedRecent = [];
    foreach ($recentResults as $r) {
        $mappedRecent[] = [
            'id' => $r['id'] ?? '',
            'subjectName' => !empty($r['subjectName']) ? $r['subjectName'] : 'Trial Quiz',
            'score' => (int)($r['score'] ?? 0),
            'total' => (int)($r['total'] ?? ($r['totalQuestions'] ?? 0)),
            'totalQuestions' => (int)($r['totalQuestions'] ?? ($r['total'] ?? 0)),
            'percent' => (int)($r['percent'] ?? 0),
            'submittedAt' => $r['createdAt'] ?? ($r['submittedAt'] ?? round(microtime(true) * 1000)),
            'createdAt' => $r['createdAt'] ?? ($r['submittedAt'] ?? round(microtime(true) * 1000))
        ];
    }

    jsonOut([
        'examsTaken' => $count,
        'avgScore' => $avgPercent,
        'passRate' => $passRate,
        'recentResults' => $mappedRecent,
        'results' => $matched,
        'stats' => [
            'examsTaken' => $count,
            'avgPercent' => $avgPercent,
            'bestPercent' => $bestPercent
        ]
    ]);
}

// Candidate Registration
if ($route === 'auth/register' && $method === 'POST') {
    $b = getJsonBody();
    $accountType = ($b['accountType'] ?? '') === 'ges-promo' ? 'ges-promo' : 'student';
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');

    if ($name === '') errorOut('Full name is required', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) errorOut('Enter a valid email address', 400);
    if (strlen($password) < 6) errorOut('Password must be at least 6 characters', 400);

    $schoolName = '';
    $gradeLevel = 4;
    $region = '';
    $promotionRank = '';

    if ($accountType === 'ges-promo') {
        $region = trim((string)($b['region'] ?? ''));
        $promotionRank = trim((string)($b['promotionRank'] ?? ''));
        if ($region === '') errorOut('Select your Ghana Region', 400);
        if ($promotionRank === '') errorOut('Select your Eligible Promotion Rank', 400);
        $schoolName = "$region ($promotionRank)";
        $gradeLevel = 'GES-PROMO';
    } else {
        $schoolName = trim((string)($b['schoolName'] ?? ''));
        $parsedLevel = normLevel($b['gradeLevel'] ?? null);
        if ($parsedLevel === null) errorOut('Choose a valid grade or exam level', 400);
        $gradeLevel = $parsedLevel;
    }

    foreach ($db['users'] as $u) {
        if (strtolower(trim((string)($u['email'] ?? ''))) === $email) {
            errorOut('An account with this email already exists. Please sign in.', 409);
        }
    }

    $userId = generateUuid();
    $token = bin2hex(random_bytes(24));
    $now = round(microtime(true) * 1000);

    $userRecord = [
        'id' => $userId,
        'name' => $name,
        'email' => $email,
        'accountType' => $accountType,
        'schoolName' => $schoolName,
        'gradeLevel' => $gradeLevel,
        'region' => $region,
        'promotionRank' => $promotionRank,
        'passwordPlain' => $password,
        'passwordHash' => password_hash($password, PASSWORD_BCRYPT),
        'createdAt' => $now
    ];

    $db['users'][] = $userRecord;
    $db['sessions'][] = [
        'id' => generateUuid(),
        'userId' => $userId,
        'token' => $token,
        'createdAt' => $now
    ];
    saveDb($db);

    jsonOut([
        'token' => $token,
        'user' => publicUser($userRecord)
    ], 201);
}

// Candidate Login
if ($route === 'auth/login' && $method === 'POST') {
    $b = getJsonBody();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');

    if ($email === '' || $password === '') errorOut('Enter your email and password', 400);

    $found = null;
    foreach ($db['users'] as $u) {
        if (strtolower(trim((string)($u['email'] ?? ''))) === $email) {
            $found = $u;
            break;
        }
    }

    if (!$found || !verifyUserPassword($password, $found)) {
        errorOut('Invalid email or password', 401);
    }

    $token = bin2hex(random_bytes(24));
    $db['sessions'][] = [
        'id' => generateUuid(),
        'userId' => $found['id'],
        'token' => $token,
        'createdAt' => round(microtime(true) * 1000)
    ];
    saveDb($db);

    jsonOut([
        'token' => $token,
        'user' => publicUser($found)
    ]);
}

// Password Recovery
if ($route === 'auth/recover' && $method === 'POST') {
    $b = getJsonBody();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $newPassword = (string)($b['newPassword'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        errorOut('Enter the email address you registered with', 400);
    }

    $foundIdx = null;
    foreach ($db['users'] as $i => $u) {
        if (strtolower(trim((string)($u['email'] ?? ''))) === $email) {
            $foundIdx = $i;
            break;
        }
    }

    if ($foundIdx === null) {
        errorOut('No registered account was found with that email address.', 404);
    }

    $user = $db['users'][$foundIdx];

    if ($newPassword !== '') {
        if (strlen($newPassword) < 6) errorOut('New password must be at least 6 characters', 400);
        $user['passwordPlain'] = $newPassword;
        $user['passwordHash'] = password_hash($newPassword, PASSWORD_BCRYPT);
        $user['updatedAt'] = round(microtime(true) * 1000);
        $db['users'][$foundIdx] = $user;

        $token = bin2hex(random_bytes(24));
        $db['sessions'][] = [
            'id' => generateUuid(),
            'userId' => $user['id'],
            'token' => $token,
            'createdAt' => round(microtime(true) * 1000)
        ];
        saveDb($db);

        jsonOut([
            'ok' => true,
            'reset' => true,
            'recoveredPassword' => $newPassword,
            'token' => $token,
            'user' => publicUser($user)
        ]);
    }

    $recovered = $user['passwordPlain'] ?? '';
    $isTemp = false;
    if ($recovered === '') {
        $recovered = 'Exam' . mt_rand(1000, 9999);
        $isTemp = true;
        $user['passwordPlain'] = $recovered;
        $user['passwordHash'] = password_hash($recovered, PASSWORD_BCRYPT);
        $user['updatedAt'] = round(microtime(true) * 1000);
        $db['users'][$foundIdx] = $user;
        saveDb($db);
    }

    $gradeLabel = ($user['accountType'] ?? '') === 'ges-promo'
        ? ($user['promotionRank'] ?? '')
        : (is_numeric($user['gradeLevel'] ?? null) ? 'Basic ' . $user['gradeLevel'] : (string)($user['gradeLevel'] ?? ''));

    jsonOut([
        'ok' => true,
        'accountName' => $user['name'] ?? '',
        'email' => $user['email'] ?? '',
        'gradeLabel' => $gradeLabel,
        'recoveredPassword' => $recovered,
        'isTemporary' => $isTemp
    ]);
}

// Auth / Me
if ($route === 'auth/me' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u) errorOut('Not signed in', 401);
    jsonOut(['user' => publicUser($u)]);
}

// Auth / Logout
if ($route === 'auth/logout' && $method === 'POST') {
    $b = getJsonBody();
    $tok = $b['token'] ?? null;
    if ($tok) {
        $db['sessions'] = array_values(array_filter($db['sessions'], function($s) use ($tok) {
            return ($s['token'] ?? '') !== $tok;
        }));
        saveDb($db);
    }
    jsonOut(['ok' => true]);
}

// Contact Form
if ($route === 'contact' && $method === 'POST') {
    $b = getJsonBody();
    $name = trim((string)($b['name'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    $phone = trim((string)($b['phone'] ?? ''));
    $topic = trim((string)($b['topic'] ?? 'Something else'));
    $msg = trim((string)($b['message'] ?? ''));

    if ($name === '') errorOut('Enter your name', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) errorOut('Enter a valid email address', 400);
    if ($msg === '') errorOut('Enter a message', 400);

    $msgRecord = [
        'id' => generateUuid(),
        'name' => $name,
        'email' => $email,
        'phone' => $phone,
        'topic' => $topic,
        'message' => $msg,
        'createdAt' => round(microtime(true) * 1000)
    ];

    $db['messages'][] = $msgRecord;
    saveDb($db);

    // Optional notification email to info@codecasticgh.com
    @mail(
        'info@codecasticgh.com',
        "New Inquiry on Codecastic GH: $topic",
        "From: $name ($email, $phone)\nTopic: $topic\n\nMessage:\n$msg",
        "From: info@codecasticgh.com\r\nReply-To: $email"
    );

    jsonOut(['ok' => true], 201);
}

// Staff Inbox Status
if ($route === 'inbox/status' && $method === 'GET') {
    jsonOut(['configured' => !empty(getInboxCode($db))]);
}

// Staff Inbox Setup
if ($route === 'inbox/setup' && $method === 'POST') {
    $b = getJsonBody();
    $passcode = trim((string)($b['passcode'] ?? ''));
    if (getInboxCode($db)) errorOut('The inbox passcode is already set', 409);
    if (strlen($passcode) < 4) errorOut('The passcode must be at least 4 characters', 400);

    $db['settings'][] = [
        'id' => generateUuid(),
        'key' => 'inbox',
        'passcode' => $passcode
    ];
    saveDb($db);
    jsonOut(['ok' => true], 201);
}

// Staff Inbox List
if ($route === 'inbox/list' && $method === 'POST') {
    $b = getJsonBody();
    if (!isStaff($db, $b['passcode'] ?? null)) errorOut('Incorrect passcode', 401);
    $msgs = $db['messages'];
    usort($msgs, function($a, $b) {
        return ($b['createdAt'] ?? 0) - ($a['createdAt'] ?? 0);
    });
    jsonOut(['messages' => $msgs]);
}

// Staff Inbox Delete
if (preg_match('#^inbox/([^/]+)/delete$#', $route, $m) && $method === 'POST') {
    $b = getJsonBody();
    if (!isStaff($db, $b['passcode'] ?? null)) errorOut('Incorrect passcode', 401);
    $id = $m[1];
    $db['messages'] = array_values(array_filter($db['messages'], function($msg) use ($id) {
        return ($msg['id'] ?? '') !== $id;
    }));
    saveDb($db);
    jsonOut(['deleted' => true]);
}

// Admin Status
if ($route === 'admin/status' && $method === 'GET') {
    jsonOut(['configured' => !empty(getAdminCode($db))]);
}

// Admin Setup
if ($route === 'admin/setup' && $method === 'POST') {
    $b = getJsonBody();
    $passcode = trim((string)($b['passcode'] ?? ''));
    if (getAdminCode($db)) errorOut('Admin passcode already set', 409);
    if (strlen($passcode) < 4) errorOut('Admin passcode must be at least 4 characters', 400);

    $db['settings'][] = [
        'id' => generateUuid(),
        'key' => 'admin',
        'passcode' => $passcode
    ];
    saveDb($db);
    jsonOut(['ok' => true], 201);
}

// Admin Login
if ($route === 'admin/login' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Incorrect passcode', 401);
    jsonOut(['ok' => true]);
}

// Admin Subjects
if ($route === 'admin/subjects' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $name = trim((string)($b['name'] ?? ''));
    if ($name === '') errorOut('Subject name is required', 400);

    $id = generateUuid();
    $sub = ['id' => $id, 'name' => $name];
    $db['subjects'][] = $sub;
    saveDb($db);
    jsonOut(['id' => $id, 'name' => $name], 201);
}

// Admin Questions List
if ($route === 'admin/questions/list' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $qs = $db['questions'];
    usort($qs, function($a, $b) {
        return ($a['createdAt'] ?? 0) - ($b['createdAt'] ?? 0);
    });
    jsonOut(['questions' => $qs]);
}

// Admin Add Question
if ($route === 'admin/questions' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $subjectId = (string)($b['subjectId'] ?? '');
    $level = normLevel($b['level'] ?? null);
    $text = trim((string)($b['text'] ?? ''));
    $options = is_array($b['options'] ?? null) ? array_map('trim', $b['options']) : [];
    $correctIndex = (int)($b['correctIndex'] ?? -1);
    $explanation = trim((string)($b['explanation'] ?? ''));
    $year = trim((string)($b['year'] ?? ''));
    $category = trim((string)($b['category'] ?? ''));

    if ($level === null) errorOut('Choose a valid level', 400);
    if ($text === '') errorOut('Question text is required', 400);
    if (count($options) !== 4 || in_array('', $options, true)) errorOut('Provide all 4 options', 400);
    if ($correctIndex < 0 || $correctIndex > 3) errorOut('Choose the correct answer', 400);

    $newQ = [
        'id' => generateUuid(),
        'subjectId' => $subjectId,
        'level' => $level,
        'text' => $text,
        'options' => $options,
        'correctIndex' => $correctIndex,
        'explanation' => $explanation,
        'year' => $year ?: null,
        'category' => $category ?: null,
        'createdAt' => round(microtime(true) * 1000)
    ];

    $db['questions'][] = $newQ;
    saveDb($db);
    jsonOut($newQ, 201);
}

// Admin Update Question
if (preg_match('#^admin/questions/([^/]+)/update$#', $route, $m) && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $id = $m[1];

    $foundIdx = null;
    foreach ($db['questions'] as $i => $q) {
        if (($q['id'] ?? '') === $id) {
            $foundIdx = $i;
            break;
        }
    }
    if ($foundIdx === null) errorOut('Question not found', 404);

    $q = $db['questions'][$foundIdx];
    if (isset($b['text'])) $q['text'] = trim((string)$b['text']);
    if (isset($b['options']) && is_array($b['options'])) $q['options'] = array_map('trim', $b['options']);
    if (isset($b['correctIndex'])) $q['correctIndex'] = (int)$b['correctIndex'];
    if (isset($b['explanation'])) $q['explanation'] = trim((string)$b['explanation']);
    if (isset($b['year'])) $q['year'] = trim((string)$b['year']);
    if (isset($b['category'])) $q['category'] = trim((string)$b['category']);
    $q['updatedAt'] = round(microtime(true) * 1000);

    $db['questions'][$foundIdx] = $q;
    saveDb($db);
    jsonOut(['question' => $q]);
}

// Admin Delete Question
if (preg_match('#^admin/questions/([^/]+)/delete$#', $route, $m) && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $id = $m[1];
    $db['questions'] = array_values(array_filter($db['questions'], function($q) use ($id) {
        return ($q['id'] ?? '') !== $id;
    }));
    saveDb($db);
    jsonOut(['deleted' => true]);
}

// -------------------------------------------------------------
// Admin Bulk Questions File Parser & Importer
// -------------------------------------------------------------
function resolvePromotionRankId($rawRank) {
    $s = trim((string)$rawRank);
    if ($s === '') return null;
    $norm = strtoupper(preg_replace('/[\s\-()]+/', '_', $s));
    $norm = trim($norm, '_');
    if ($norm === 'AD_II' || $norm === 'AD2' || $norm === 'RANK_AD_II' || strpos($norm, 'ASSISTANT_DIRECTOR_II') !== false || substr($norm, -6) === '_AD_II') {
        return 'rank-ad-ii';
    }
    if ($norm === 'AD_I' || $norm === 'AD1' || $norm === 'RANK_AD_I' || strpos($norm, 'ASSISTANT_DIRECTOR_I') !== false || substr($norm, -5) === '_AD_I') {
        return 'rank-ad-i';
    }
    if ($norm === 'DD' || $norm === 'RANK_DD' || strpos($norm, 'DEPUTY_DIRECTOR') !== false || substr($norm, -3) === '_DD') {
        return 'rank-dd';
    }
    if ($norm === 'DIR_II' || $norm === 'DIR2' || $norm === 'RANK_DIR_II' || strpos($norm, 'DIRECTOR_II') !== false || substr($norm, -7) === '_DIR_II') {
        return 'rank-dir-ii';
    }
    if ($norm === 'DIR_I' || $norm === 'DIR1' || $norm === 'RANK_DIR_I' || strpos($norm, 'DIRECTOR_I') !== false || substr($norm, -6) === '_DIR_I') {
        return 'rank-dir-i';
    }
    return null;
}

function resolveCorrectIndex($rawAns, $options) {
    if (is_int($rawAns)) {
        if ($rawAns >= 0 && $rawAns <= 3) return $rawAns;
        if ($rawAns >= 1 && $rawAns <= 4) return $rawAns - 1;
    }
    $s = trim((string)$rawAns);
    if ($s === '') return -1;
    if (preg_match('/^(?:option\s*)?\(?([A-Da-d])\)?(?:\s*[:.)-].*)?$/i', $s, $m)) {
        return ord(strtoupper($m[1])) - 65;
    }
    if (preg_match('/^[1-4]$/', $s)) {
        return (int)$s - 1;
    }
    foreach ($options as $idx => $opt) {
        if (strcasecmp(trim($opt), $s) === 0) return $idx;
    }
    return -1;
}

function parseCsvRows($rawText) {
    $cleaned = preg_replace('/^\xEF\xBB\xBF/', '', $rawText);
    $lines = preg_split('/\r?\n/', $cleaned);
    $firstLine = $lines[0] ?? '';
    $delimiter = (strpos($firstLine, "\t") !== false && strpos($firstLine, ',') === false)
        ? "\t"
        : (substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',');
    
    $rows = [];
    $fp = fopen('php://temp', 'r+');
    fwrite($fp, $cleaned);
    rewind($fp);
    while (($row = fgetcsv($fp, 0, $delimiter)) !== false) {
        if (!empty(array_filter($row, function($c) { return trim($c) !== ''; }))) {
            $rows[] = array_map('trim', $row);
        }
    }
    fclose($fp);
    return $rows;
}

function parseTableRowsToItems($rows) {
    if (empty($rows)) return [];
    $first = array_map(function($h) {
        return preg_replace('/[^a-z0-9]/', '', strtolower($h));
    }, $rows[0]);

    $hasHeader = false;
    foreach ($first as $h) {
        if (strpos($h, 'question') !== false || $h === 'text' || $h === 'prompt') {
            $hasHeader = true;
            break;
        }
    }

    $qIdx = 0; $aIdx = 1; $bIdx = 2; $cIdx = 3; $dIdx = 4;
    $ansIdx = 5; $expIdx = 6; $lvlIdx = 7; $yearIdx = -1; $rankIdx = -1; $catIdx = -1;

    if ($hasHeader) {
        foreach ($first as $i => $h) {
            if ($yearIdx === -1 && ($h === 'year' || strpos($h, 'examyear') !== false)) $yearIdx = $i;
            if ($rankIdx === -1 && ($h === 'rank' || strpos($h, 'promotionrank') !== false)) $rankIdx = $i;
            if ($catIdx === -1 && ($h === 'category' || $h === 'topic' || $h === 'domain')) $catIdx = $i;
            if (strpos($h, 'question') !== false || $h === 'text' || $h === 'prompt') $qIdx = $i;
            if ($h === 'optiona' || $h === 'a' || $h === 'choicea') $aIdx = $i;
            if ($h === 'optionb' || $h === 'b' || $h === 'choiceb') $bIdx = $i;
            if ($h === 'optionc' || $h === 'c' || $h === 'choicec') $cIdx = $i;
            if ($h === 'optiond' || $h === 'd' || $h === 'choiced') $dIdx = $i;
            if (strpos($h, 'correct') !== false || strpos($h, 'answer') !== false || $h === 'key') $ansIdx = $i;
            if (strpos($h, 'explanation') !== false || strpos($h, 'rationale') !== false || strpos($h, 'note') !== false) $expIdx = $i;
            if (strpos($h, 'level') !== false || strpos($h, 'grade') !== false || strpos($h, 'section') !== false) $lvlIdx = $i;
        }
    }

    $startRow = $hasHeader ? 1 : 0;
    $out = [];
    for ($r = $startRow; $r < count($rows); $r++) {
        $row = $rows[$r];
        $text = trim((string)($row[$qIdx] ?? ''));
        if ($text === '') continue;
        if (strtolower($text) === 'question' && strpos(strtolower($row[$aIdx] ?? ''), 'option') !== false) continue;
        $opts = [
            trim((string)($row[$aIdx] ?? '')),
            trim((string)($row[$bIdx] ?? '')),
            trim((string)($row[$cIdx] ?? '')),
            trim((string)($row[$dIdx] ?? ''))
        ];
        if (in_array('', $opts, true)) continue;
        $cIdx = resolveCorrectIndex($row[$ansIdx] ?? null, $opts);
        if ($cIdx < 0 || $cIdx > 3) continue;

        $exp = ($expIdx >= 0 && isset($row[$expIdx])) ? trim((string)$row[$expIdx]) : '';
        $rawLvl = ($lvlIdx >= 0 && isset($row[$lvlIdx])) ? $row[$lvlIdx] : null;
        $year = ($yearIdx >= 0 && isset($row[$yearIdx])) ? trim((string)$row[$yearIdx]) : null;
        $cat = ($catIdx >= 0 && isset($row[$catIdx])) ? trim((string)$row[$catIdx]) : null;
        $rawRank = ($rankIdx >= 0 && isset($row[$rankIdx])) ? trim((string)$row[$rankIdx]) : null;
        $rankId = resolvePromotionRankId($rawRank);

        $out[] = [
            'text' => $text,
            'options' => $opts,
            'correctIndex' => $cIdx,
            'explanation' => $exp,
            'level' => $rankId ? 'GES-PROMO' : ($rawLvl ? normLevel($rawLvl) : null),
            'subjectId' => $rankId ?: null,
            'year' => $year ?: null,
            'category' => $cat ?: null,
            'rank' => $rawRank ?: null
        ];
    }
    return $out;
}

function parseWordOrTextBlocks($rawText) {
    if (stripos($rawText, '<tr') !== false && stripos($rawText, '<td') !== false) {
        if (preg_match_all('/<tr[\s\S]*?<\/tr>/i', $rawText, $trMatches)) {
            $tableRows = [];
            foreach ($trMatches[0] as $tr) {
                if (preg_match_all('/<t[dh][\s\S]*?<\/t[dh]>/i', $tr, $cellMatches)) {
                    if (count($cellMatches[0]) >= 6) {
                        $cells = array_map(function($c) {
                            return trim(html_entity_decode(strip_tags($c), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                        }, $cellMatches[0]);
                        $tableRows[] = $cells;
                    }
                }
            }
            $fromTable = parseTableRowsToItems($tableRows);
            if (!empty($fromTable)) return $fromTable;
        }
    }

    $plain = preg_replace('/<\/(p|div|tr|li|h[1-6]|br\s*\/?)>/i', "\n", $rawText);
    $plain = preg_replace('/<br\s*\/?>/i', "\n", $plain);
    $plain = html_entity_decode(strip_tags($plain), ENT_QUOTES | ENT_HTML5, 'UTF-8');

    $lines = array_filter(array_map('trim', preg_split('/\r?\n/', $plain)));
    $items = [];
    $curQ = '';
    $curOpts = ['', '', '', ''];
    $curAns = '';
    $curExp = '';
    $curYear = '';
    $curCat = '';
    $curRank = '';
    $curLvl = null;

    $flush = function() use (&$items, &$curQ, &$curOpts, &$curAns, &$curExp, &$curYear, &$curCat, &$curRank, &$curLvl) {
        if ($curQ !== '' && count(array_filter($curOpts)) === 4) {
            $cIdx = resolveCorrectIndex($curAns, $curOpts);
            if ($cIdx >= 0 && $cIdx <= 3) {
                $rankId = resolvePromotionRankId($curRank);
                $items[] = [
                    'text' => $curQ,
                    'options' => $curOpts,
                    'correctIndex' => $cIdx,
                    'explanation' => $curExp,
                    'level' => $rankId ? 'GES-PROMO' : ($curLvl ?: null),
                    'subjectId' => $rankId ?: null,
                    'year' => $curYear ?: null,
                    'category' => $curCat ?: null,
                    'rank' => $curRank ?: null
                ];
            }
        }
        $curQ = '';
        $curOpts = ['', '', '', ''];
        $curAns = '';
        $curExp = '';
        $curYear = '';
        $curCat = '';
        $curRank = '';
        $curLvl = null;
    };

    foreach ($lines as $line) {
        if (preg_match('/^---+$/', $line)) {
            $flush();
            continue;
        }
        if (preg_match('/^(?:year|exam\s*year)\s*[:=\-]\s*(.+)$/i', $line, $m)) {
            if ($curQ !== '' && count(array_filter($curOpts)) === 4) $flush();
            $curYear = trim($m[1]);
            continue;
        }
        if (preg_match('/^(?:rank|promotion\s*rank)\s*[:=\-]\s*(.+)$/i', $line, $m)) {
            if ($curQ !== '' && count(array_filter($curOpts)) === 4) $flush();
            $curRank = trim($m[1]);
            continue;
        }
        if (preg_match('/^(?:category|topic|domain)\s*[:=\-]\s*(.+)$/i', $line, $m)) {
            if ($curQ !== '' && count(array_filter($curOpts)) === 4) $flush();
            $curCat = trim($m[1]);
            continue;
        }
        if (preg_match('/^(?:level|grade|class|section)\s*[:=\-]\s*(.+)$/i', $line, $m)) {
            $lvl = normLevel(trim($m[1]));
            if ($curQ !== '' && count(array_filter($curOpts)) === 4 && !$curLvl) {
                $curLvl = $lvl;
            } else {
                if ($curQ !== '' && count(array_filter($curOpts)) === 4) $flush();
                $curLvl = $lvl;
            }
            continue;
        }
        if (preg_match('/^(\*)?(?:option\s*)?\(?([A-Da-d])\)?\s*[:.)\-]\s*(.+)$/i', $line, $m)) {
            if ($curQ !== '') {
                $starred = !empty($m[1]);
                $idx = ord(strtoupper($m[2])) - 65;
                $curOpts[$idx] = trim($m[3]);
                if ($starred && $curAns === '') $curAns = strtoupper($m[2]);
                continue;
            }
        }
        if (preg_match('/^(?:correct\s*answer|correct\s*choice|answer|correct|ans|key)\s*[:=\-]\s*(.+)$/i', $line, $m)) {
            if ($curQ !== '') {
                $curAns = trim($m[1]);
                continue;
            }
        }
        if (preg_match('/^(?:explanation|rationale|note)\s*[:=\-]\s*(.*)$/i', $line, $m)) {
            if ($curQ !== '') {
                $curExp = trim($m[1]);
                continue;
            }
        }
        if (preg_match('/^(?:question\s*\d*|q\d+|\d+)\s*[:.)\-]\s*(.+)$/i', $line, $m)) {
            if ($curQ !== '') $flush();
            $curQ = trim($m[1]);
            continue;
        }
    }
    $flush();
    return $items;
}

function normalizeJsonItems($rawList) {
    $out = [];
    foreach ($rawList as $item) {
        if (!is_array($item)) continue;
        $text = trim((string)($item['question'] ?? $item['Question'] ?? $item['text'] ?? ''));
        if ($text === '') continue;
        $opts = [];
        if (!empty($item['options']) && is_array($item['options'])) {
            $opts = array_slice(array_map('trim', $item['options']), 0, 4);
        } else {
            $opts = [
                trim((string)($item['optionA'] ?? $item['a'] ?? $item['A'] ?? '')),
                trim((string)($item['optionB'] ?? $item['b'] ?? $item['B'] ?? '')),
                trim((string)($item['optionC'] ?? $item['c'] ?? $item['C'] ?? '')),
                trim((string)($item['optionD'] ?? $item['d'] ?? $item['D'] ?? ''))
            ];
        }
        if (count($opts) !== 4 || in_array('', $opts, true)) continue;
        $rawAns = $item['correctIndex'] ?? $item['correctAnswer'] ?? $item['answer'] ?? $item['correct'] ?? $item['Correct'] ?? null;
        $cIdx = resolveCorrectIndex($rawAns, $opts);
        if ($cIdx < 0 || $cIdx > 3) continue;

        $rawRank = $item['rank'] ?? $item['Rank'] ?? $item['promotionRank'] ?? null;
        $rankId = resolvePromotionRankId($rawRank);
        $level = $rankId ? 'GES-PROMO' : (isset($item['level']) ? normLevel($item['level']) : (isset($item['Level']) ? normLevel($item['Level']) : null));

        $out[] = [
            'text' => $text,
            'options' => $opts,
            'correctIndex' => $cIdx,
            'explanation' => trim((string)($item['explanation'] ?? $item['Explanation'] ?? '')),
            'level' => $level,
            'subjectId' => $rankId ?: (!empty($item['subjectId']) ? trim((string)$item['subjectId']) : null),
            'year' => !empty($item['year']) ? trim((string)$item['year']) : (!empty($item['Year']) ? trim((string)$item['Year']) : null),
            'category' => !empty($item['category']) ? trim((string)$item['category']) : (!empty($item['Category']) ? trim((string)$item['Category']) : null),
            'rank' => $rawRank ? trim((string)$rawRank) : null
        ];
    }
    return $out;
}

function parseBulkQuestionsPayload($b) {
    if (!empty($b['questions']) && is_array($b['questions'])) {
        return normalizeJsonItems($b['questions']);
    }
    $fileName = strtolower(trim((string)($b['fileName'] ?? '')));
    $fileBase64 = (string)($b['fileBase64'] ?? '');
    if ($fileBase64 === '') return [];

    $raw = base64_decode($fileBase64);
    if ($raw === false) return [];

    $isZip = (strlen($raw) >= 4 && substr($raw, 0, 4) === "PK\x03\x04");
    if ($isZip && class_exists('ZipArchive')) {
        $tmp = tempnam(sys_get_temp_dir(), 'codecastic_zip_');
        file_put_contents($tmp, $raw);
        $zip = new ZipArchive();
        if ($zip->open($tmp) === true) {
            $docXml = $zip->getFromName('word/document.xml');
            if ($docXml !== false) {
                $zip->close();
                @unlink($tmp);
                return parseWordOrTextBlocks($docXml);
            }
            $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
            $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
            if ($sheetXml !== false) {
                $sharedStrings = [];
                if ($sharedXml !== false) {
                    if (preg_match_all('/<si[\s>][\s\S]*?<\/si>/i', $sharedXml, $siMatches)) {
                        foreach ($siMatches[0] as $si) {
                            if (preg_match_all('/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/i', $si, $tMatches)) {
                                $sharedStrings[] = html_entity_decode(implode('', $tMatches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                            } else {
                                $sharedStrings[] = '';
                            }
                        }
                    }
                }
                $rows = [];
                if (preg_match_all('/<row[\s>][\s\S]*?<\/row>/i', $sheetXml, $rowMatches)) {
                    foreach ($rowMatches[0] as $rXml) {
                        $cells = [];
                        if (preg_match_all('/<c[\s>][\s\S]*?<\/c>/i', $rXml, $cMatches)) {
                            foreach ($cMatches[0] as $cXml) {
                                $isStr = (strpos($cXml, 't="s"') !== false);
                                if (preg_match('/<v>([\s\S]*?)<\/v>/i', $cXml, $vMatch)) {
                                    $val = trim($vMatch[1]);
                                    $cells[] = $isStr ? ($sharedStrings[(int)$val] ?? '') : $val;
                                } elseif (preg_match('/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/i', $cXml, $tMatch)) {
                                    $cells[] = html_entity_decode($tMatch[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
                                }
                            }
                        }
                        if (!empty(array_filter($cells))) $rows[] = $cells;
                    }
                }
                $zip->close();
                @unlink($tmp);
                $fromTable = parseTableRowsToItems($rows);
                if (!empty($fromTable)) return $fromTable;
            }
            $zip->close();
        }
        @unlink($tmp);
    }

    if (substr($fileName, -5) === '.json') {
        $parsed = json_decode(preg_replace('/^\xEF\xBB\xBF/', '', $raw), true);
        if (is_array($parsed)) {
            $arr = isset($parsed['questions']) && is_array($parsed['questions']) ? $parsed['questions'] : $parsed;
            return normalizeJsonItems($arr);
        }
    }

    if (substr($fileName, -4) === '.csv' || substr($fileName, -4) === '.tsv') {
        return parseTableRowsToItems(parseCsvRows($raw));
    }

    $fromBlocks = parseWordOrTextBlocks($raw);
    if (!empty($fromBlocks)) return $fromBlocks;

    return parseTableRowsToItems(parseCsvRows($raw));
}

// Admin Bulk Upload Questions
if ($route === 'admin/questions/bulk' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    global $PROMOTION_RANK_ITEMS;
    $defaultSubjectId = trim((string)($b['subjectId'] ?? ''));
    $defaultLevel = normLevel($b['level'] ?? null);

    $subjects = $db['subjects'] ?? [];
    $isValidSubjectOrRank = function($id) use ($subjects, $PROMOTION_RANK_ITEMS) {
        foreach ($subjects as $s) {
            if (($s['id'] ?? '') === $id) return true;
        }
        foreach ($PROMOTION_RANK_ITEMS as $r) {
            if ($r['id'] === $id) return true;
        }
        return false;
    };

    $parsedItems = parseBulkQuestionsPayload($b);
    if (empty($parsedItems)) {
        errorOut('No valid questions found in the uploaded file. Please make sure each question has question text, 4 answer options (A–D), and a correct answer (A, B, C, or D).', 400);
    }

    $now = round(microtime(true) * 1000);
    $addedRecords = [];
    foreach ($parsedItems as $i => $item) {
        $targetSubjectId = (!empty($item['subjectId']) && $isValidSubjectOrRank($item['subjectId']))
            ? $item['subjectId']
            : $defaultSubjectId;
        $targetLevel = (!empty($item['level']))
            ? $item['level']
            : $defaultLevel;

        if (!$targetSubjectId || !$isValidSubjectOrRank($targetSubjectId)) {
            errorOut('Choose a valid subject or promotion rank before uploading.', 400);
        }
        if ($targetLevel === null) {
            errorOut('Choose a valid class level or exam section before uploading.', 400);
        }

        $newQ = [
            'id' => generateUuid(),
            'subjectId' => $targetSubjectId,
            'level' => $targetLevel,
            'text' => $item['text'],
            'options' => $item['options'],
            'correctIndex' => $item['correctIndex'],
            'explanation' => $item['explanation'] ?? '',
            'year' => $item['year'] ?? null,
            'category' => $item['category'] ?? null,
            'rank' => $item['rank'] ?? null,
            'createdAt' => $now + $i
        ];

        $db['questions'][] = $newQ;
        $addedRecords[] = $newQ;
    }

    saveDb($db);

    jsonOut([
        'imported' => count($addedRecords),
        'questions' => $addedRecords
    ], 201);
}

// Admin Results
if ($route === 'admin/results' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $res = $db['results'];
    usort($res, function($a, $b) {
        return ($b['createdAt'] ?? 0) - ($a['createdAt'] ?? 0);
    });
    jsonOut(['results' => $res]);
}

// Admin Candidates (Aggregation of registered candidates & exam takers)
if ($route === 'admin/candidates' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $rawUsers = $db['users'];
    $rawResults = $db['results'];

    $allCandidates = $rawUsers;
    $seenEmails = [];
    $seenIds = [];

    foreach ($rawUsers as $u) {
        $em = strtolower(trim((string)($u['email'] ?? '')));
        $id = trim((string)($u['id'] ?? ''));
        if ($em !== '') $seenEmails[$em] = true;
        if ($id !== '') $seenIds[$id] = true;
    }

    foreach ($rawResults as $r) {
        $em = strtolower(trim((string)($r['studentEmail'] ?? '')));
        $id = trim((string)($r['userId'] ?? ''));
        if ($em !== '' && !isset($seenEmails[$em])) {
            $seenEmails[$em] = true;
            if ($id !== '') $seenIds[$id] = true;
            $allCandidates[] = [
                'id' => $id ?: 'candidate-res-' . ($r['id'] ?? generateUuid()),
                'name' => $r['studentName'] ?: ($r['studentEmail'] ?: 'Candidate'),
                'email' => $r['studentEmail'] ?: '',
                'accountType' => ($r['level'] ?? '') === 'GES-PROMO' ? 'ges-promo' : 'student',
                'gradeLevel' => ($r['level'] ?? '') === 'GES-PROMO' ? 'GES-PROMO' : ($r['level'] ?? 4),
                'schoolName' => $r['schoolName'] ?: '',
                'region' => '',
                'promotionRank' => ($r['level'] ?? '') === 'GES-PROMO' ? ($r['subjectName'] ?? '') : '',
                'createdAt' => $r['createdAt'] ?? round(microtime(true) * 1000)
            ];
        }
    }

    $candidateList = [];
    $totalExamsOverall = 0;
    $totalPercentOverall = 0;

    foreach ($allCandidates as $u) {
        $uEmail = strtolower(trim((string)($u['email'] ?? '')));
        $uId = trim((string)($u['id'] ?? ''));
        $uName = strtolower(trim((string)($u['name'] ?? '')));

        $userResults = [];
        foreach ($rawResults as $r) {
            $rUserId = trim((string)($r['userId'] ?? ''));
            $rEmail = strtolower(trim((string)($r['studentEmail'] ?? '')));
            $rName = strtolower(trim((string)($r['studentName'] ?? '')));
            if (($uId !== '' && $rUserId === $uId) || ($uEmail !== '' && $rEmail === $uEmail) || ($uName !== '' && $rName === $uName)) {
                $userResults[] = $r;
            }
        }

        usort($userResults, function($a, $b) {
            return ($b['createdAt'] ?? 0) - ($a['createdAt'] ?? 0);
        });

        $examsTaken = count($userResults);
        $totalScore = 0;
        $bestPercent = 0;
        foreach ($userResults as $ur) {
            $p = (int)($ur['percent'] ?? 0);
            $totalScore += $p;
            if ($p > $bestPercent) $bestPercent = $p;
        }

        $avgPercent = $examsTaken > 0 ? round($totalScore / $examsTaken) : 0;
        $lastExamAt = !empty($userResults) ? ($userResults[0]['createdAt'] ?? null) : null;
        $lastSubject = !empty($userResults) ? ($userResults[0]['subjectName'] ?? null) : null;

        $status = 'Pending';
        if ($examsTaken > 0) {
            if ($avgPercent >= 75) $status = 'Distinction';
            elseif ($avgPercent >= 50) $status = 'Pass';
            else $status = 'Remedial';
        }

        $totalExamsOverall += $examsTaken;
        $totalPercentOverall += $avgPercent;

        $candidateList[] = [
            'id' => $u['id'] ?? '',
            'name' => $u['name'] ?? '',
            'email' => $u['email'] ?? '',
            'accountType' => $u['accountType'] ?? 'student',
            'gradeLevel' => $u['gradeLevel'] ?? 4,
            'region' => $u['region'] ?? '',
            'promotionRank' => $u['promotionRank'] ?? '',
            'schoolName' => $u['schoolName'] ?? '',
            'registeredAt' => $u['createdAt'] ?? 0,
            'examsTaken' => $examsTaken,
            'avgPercent' => $avgPercent,
            'bestPercent' => $bestPercent,
            'lastExamAt' => $lastExamAt,
            'lastSubject' => $lastSubject,
            'status' => $status,
            'recentResults' => array_slice($userResults, 0, 5)
        ];
    }

    $overallAvg = count($candidateList) > 0 ? round($totalPercentOverall / count($candidateList)) : 0;

    jsonOut([
        'candidates' => $candidateList,
        'totalCandidates' => count($candidateList),
        'totalExams' => $totalExamsOverall,
        'overallAverage' => $overallAvg
    ]);
}

// Admin Database Backup Download
if ($route === 'admin/backup-download' && $method === 'GET') {
    $code = $_GET['passcode'] ?? '';
    if (!isAdmin($db, $code)) errorOut('Not authorised', 401);
    
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="codecastic-backup-' . date('Y-m-d-His') . '.json"');
    echo json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// Admin Database Restore / Merge
if ($route === 'admin/restore-database' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    
    $importData = $b['data'] ?? null;
    if (!is_array($importData)) errorOut('Invalid backup data supplied', 400);

    $importedUsers = 0;
    $importedResults = 0;

    // Merge users safely
    if (!empty($importData['users']) && is_array($importData['users'])) {
        $existingEmails = [];
        foreach ($db['users'] as $u) {
            $em = strtolower(trim((string)($u['email'] ?? '')));
            if ($em !== '') $existingEmails[$em] = true;
        }
        foreach ($importData['users'] as $iu) {
            $em = strtolower(trim((string)($iu['email'] ?? '')));
            if ($em !== '' && !isset($existingEmails[$em])) {
                $db['users'][] = $iu;
                $existingEmails[$em] = true;
                $importedUsers++;
            }
        }
    }

    // Merge results safely
    if (!empty($importData['results']) && is_array($importData['results'])) {
        $existingResIds = [];
        foreach ($db['results'] as $r) {
            if (!empty($r['id'])) $existingResIds[$r['id']] = true;
        }
        foreach ($importData['results'] as $ir) {
            if (!empty($ir['id']) && !isset($existingResIds[$ir['id']])) {
                $db['results'][] = $ir;
                $existingResIds[$ir['id']] = true;
                $importedResults++;
            }
        }
    }

    saveDb($db);
    jsonOut([
        'ok' => true,
        'message' => "Restored successfully: $importedUsers new candidates, $importedResults exam records added.",
        'totalUsers' => count($db['users']),
        'totalResults' => count($db['results'])
    ]);
}

// Admin Server Storage Scanner (Searches for any other candidate backups on the server)
if ($route === 'admin/scan-server' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $foundFiles = [];
    $searchDirs = [
        $dataDir,
        $dataDir . '/backups',
        __DIR__,
        dirname(__DIR__),
        dirname(__DIR__) . '/.trash',
        dirname(__DIR__) . '/repositories/codecastic-gh/website/data'
    ];

    foreach ($searchDirs as $dir) {
        if (!is_dir($dir)) continue;
        $files = @scandir($dir);
        if (!$files) continue;
        foreach ($files as $f) {
            if ($f === '.' || $f === '..') continue;
            $fullPath = $dir . '/' . $f;
            if (is_file($fullPath) && (substr($f, -5) === '.json' || substr($f, -4) === '.bak')) {
                $size = filesize($fullPath);
                $raw = @file_get_contents($fullPath, false, null, 0, 50000);
                $hasCynthia = (strpos($raw, 'cynthia') !== false || strpos($raw, 'Cynthia') !== false);
                $hasUsers = (strpos($raw, '"users"') !== false);
                $foundFiles[] = [
                    'path' => $fullPath,
                    'file' => $f,
                    'size' => $size,
                    'hasCynthia' => $hasCynthia,
                    'hasUsers' => $hasUsers
                ];
            }
        }
    }

    jsonOut([
        'scannedDirectories' => $searchDirs,
        'foundFiles' => $foundFiles
    ]);
}

// -------------------------------------------------------------
// Gemini AI API Client & Helpers
// -------------------------------------------------------------
function getAiSettings($db) {
    global $dataDir;
    $settings = [
        'apiKey' => '',
        'enabled' => true,
        'model' => 'gemini-3.5-flash-lite'
    ];
    foreach ($db['settings'] as $s) {
        if (isset($s['key']) && $s['key'] === 'ai_config') {
            if (!empty($s['apiKey'])) $settings['apiKey'] = trim((string)$s['apiKey']);
            if (isset($s['enabled'])) $settings['enabled'] = (bool)$s['enabled'];
            if (!empty($s['model'])) $settings['model'] = trim((string)$s['model']);
            break;
        }
    }
    if (empty($settings['apiKey'])) {
        $seedFile = $dataDir . '/seed.json';
        if (file_exists($seedFile)) {
            $seed = json_decode(@file_get_contents($seedFile), true);
            if (is_array($seed) && !empty($seed['settings'])) {
                foreach ($seed['settings'] as $ss) {
                    if (isset($ss['key']) && $ss['key'] === 'ai_config' && !empty($ss['apiKey'])) {
                        $settings['apiKey'] = trim((string)$ss['apiKey']);
                        if (!empty($ss['model'])) $settings['model'] = trim((string)$ss['model']);
                        break;
                    }
                }
            }
        }
    }
    if (empty($settings['apiKey'])) {
        $envKey = getenv('GEMINI_API_KEY') ?: getenv('AI_API_KEY');
        if ($envKey) $settings['apiKey'] = trim($envKey);
    }
    return $settings;
}

function callGeminiApi($prompt, $apiKey, $model = 'gemini-3.5-flash-lite') {
    if (empty($apiKey)) return null;

    $modelMap = [
        'gemini-1.5-flash' => 'gemini-3.5-flash-lite',
        'gemini-1.5-pro' => 'gemini-3.5-flash',
        'gemini-2.0-flash' => 'gemini-3.5-flash-lite',
        'gemini-2.0-flash-exp' => 'gemini-3.5-flash-lite'
    ];
    $cleanModel = trim((string)$model);
    if (isset($modelMap[$cleanModel])) {
        $cleanModel = $modelMap[$cleanModel];
    }
    if (empty($cleanModel)) {
        $cleanModel = 'gemini-3.5-flash-lite';
    }

    $candidateModels = array_unique([$cleanModel, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.8-flash']);

    foreach ($candidateModels as $currentModel) {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$currentModel}:generateContent?key=" . urlencode($apiKey);
        $payload = [
            'contents' => [
                [
                    'parts' => [
                        ['text' => $prompt]
                    ]
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.2,
                'maxOutputTokens' => 1200
            ]
        ];

        $jsonData = json_encode($payload);

        // Call using cURL
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'x-goog-api-key: ' . $apiKey,
                'Content-Length: ' . strlen($jsonData)
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300 && $response) {
                $parsed = json_decode($response, true);
                $text = $parsed['candidates'][0]['content']['parts'][0]['text'] ?? null;
                if ($text) return trim($text);
            }
        }

        // Fallback using stream context
        $opts = [
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nx-goog-api-key: {$apiKey}\r\nContent-Length: " . strlen($jsonData) . "\r\n",
                'content' => $jsonData,
                'timeout' => 15
            ]
        ];
        $context = stream_context_create($opts);
        $response = @file_get_contents($url, false, $context);
        if ($response) {
            $parsed = json_decode($response, true);
            $text = $parsed['candidates'][0]['content']['parts'][0]['text'] ?? null;
            if ($text) return trim($text);
        }
    }

    return null;
}

// Admin AI Settings (GET)
if ($route === 'admin/ai-settings' && $method === 'GET') {
    $code = $_GET['passcode'] ?? '';
    if (!isAdmin($db, $code)) errorOut('Not authorised', 401);

    $ai = getAiSettings($db);
    $configured = !empty($ai['apiKey']);
    $maskedKey = '';
    if ($configured) {
        $len = strlen($ai['apiKey']);
        $maskedKey = substr($ai['apiKey'], 0, 6) . str_repeat('*', max(4, $len - 10)) . substr($ai['apiKey'], -4);
    }

    jsonOut([
        'configured' => $configured,
        'enabled' => $ai['enabled'],
        'maskedKey' => $maskedKey,
        'model' => $ai['model']
    ]);
}

// Admin AI Settings (POST)
if ($route === 'admin/ai-settings' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $apiKey = trim((string)($b['apiKey'] ?? ''));
    $enabled = isset($b['enabled']) ? (bool)$b['enabled'] : true;
    $model = !empty($b['model']) ? trim((string)$b['model']) : 'gemini-1.5-flash';

    // If an API key was provided, verify it with a quick test ping
    if ($apiKey !== '') {
        $testPrompt = "Test ping. Respond strictly with 'OK'.";
        $testRes = callGeminiApi($testPrompt, $apiKey, $model);
        if (!$testRes) {
            errorOut('Could not verify Gemini API Key. Please verify the key from Google AI Studio and ensure your server can make outgoing HTTPS requests.', 400);
        }
    }

    // Save or update in settings
    $foundIdx = null;
    foreach ($db['settings'] as $i => $s) {
        if (isset($s['key']) && $s['key'] === 'ai_config') {
            $foundIdx = $i;
            break;
        }
    }

    $entry = [
        'id' => $foundIdx !== null ? ($db['settings'][$foundIdx]['id'] ?? generateUuid()) : generateUuid(),
        'key' => 'ai_config',
        'apiKey' => $apiKey ?: ($foundIdx !== null ? ($db['settings'][$foundIdx]['apiKey'] ?? '') : ''),
        'enabled' => $enabled,
        'model' => $model,
        'updatedAt' => round(microtime(true) * 1000)
    ];

    if ($foundIdx !== null) {
        $db['settings'][$foundIdx] = $entry;
    } else {
        $db['settings'][] = $entry;
    }

    saveDb($db);

    jsonOut([
        'ok' => true,
        'message' => 'Gemini AI connection verified and settings saved successfully.',
        'configured' => !empty($entry['apiKey']),
        'enabled' => $entry['enabled']
    ]);
}

// AI Question Audit & Auto-Resolution (POST)
if ($route === 'ai/audit-question' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $q = is_array($b['question'] ?? null) ? $b['question'] : [];
    $text = trim((string)($q['text'] ?? ''));
    $options = is_array($q['options'] ?? null) ? array_map('trim', $q['options']) : [];
    $correctIndex = (int)($q['correctIndex'] ?? 0);
    $explanation = trim((string)($q['explanation'] ?? ''));
    $level = (string)($q['level'] ?? '');
    $subjectId = (string)($q['subjectId'] ?? '');

    if ($text === '' || count($options) !== 4) {
        errorOut('Invalid question data provided for audit.', 400);
    }

    // 1. Detect duplicates locally first
    $cleanedOpts = array_map('strtolower', $options);
    $dupes = [];
    $seen = [];
    foreach ($cleanedOpts as $opt) {
        if (isset($seen[$opt])) $dupes[$opt] = true;
        $seen[$opt] = true;
    }
    $hasLocalDuplicates = !empty($dupes);

    // 2. Query Gemini AI for educational audit and fix recommendation
    $ai = getAiSettings($db);
    $aiResponse = null;

    if (!empty($ai['apiKey']) && $ai['enabled']) {
        $aiPrompt = "You are an expert curriculum developer and exam question auditor for the Ghanaian pre-tertiary and teacher promotion curriculum (BECE, WASSCE, GTLE, GES Promotion).
Analyze this multiple-choice exam question:
Question: {$text}
Options:
A) {$options[0]}
B) {$options[1]}
C) {$options[2]}
D) {$options[3]}
Marked Correct Answer: Option " . chr(65 + $correctIndex) . " ({$options[$correctIndex]})
Explanation: {$explanation}

CRITICAL RULES & AUDIT REQUIREMENTS:
1. NEVER include 'None of the above', 'All of the above', or generic non-answers as an option. All 4 options must be genuine, distinct, curriculum-aligned distractors or answers.
2. If any options are identical or duplicates, replace duplicate options with high-quality, educationally relevant, distinct alternative choices that fit the subject context.
3. Ensure the marked correct answer matches the explanation and accurate curriculum facts.
4. Set 'correctIndex' to the 0-based index of the true correct answer (0 for A, 1 for B, 2 for C, 3 for D).

Respond strictly in valid JSON format:
{
  \"hasIssue\": true,
  \"issueSummary\": \"Detailed explanation of detected duplicate or flaw and what was repaired.\",
  \"correctedOptions\": [\"Option A\", \"Option B\", \"Option C\", \"Option D\"],
  \"correctIndex\": 2,
  \"explanation\": \"Updated explanation confirming the correct answer.\"
}";

        $rawAi = callGeminiApi($aiPrompt, $ai['apiKey'], $ai['model']);
        if ($rawAi) {
            // Strip markdown backticks if present
            $cleaned = preg_replace('/^```(?:json)?\s*/i', '', trim($rawAi));
            $cleaned = preg_replace('/\s*```$/', '', $cleaned);
            $parsed = json_decode($cleaned, true);
            if (is_array($parsed) && isset($parsed['correctedOptions']) && count($parsed['correctedOptions']) === 4) {
                // Ensure none of the corrected options say 'None of the above'
                $hasForbiddenOption = false;
                foreach ($parsed['correctedOptions'] as $co) {
                    if (preg_match('/none\s+of\s+the\s+above|all\s+of\s+the\s+above/i', $co)) {
                        $hasForbiddenOption = true;
                        break;
                    }
                }
                if (!$hasForbiddenOption) {
                    $aiResponse = $parsed;
                }
            }
        }
    }

    // 3. Fallback Heuristic if AI API is not active or did not return JSON
    if (!$aiResponse) {
        if ($hasLocalDuplicates) {
            $duplicateText = implode(', ', array_keys($dupes));
            // Context-aware distractors, NEVER 'None of the above'
            $lowText = strtolower($text . ' ' . $explanation);
            $replacement = 'The organ system';
            if (stripos($lowText, 'cell') !== false || stripos($lowText, 'living') !== false || stripos($lowText, 'tissue') !== false) {
                $replacement = 'The organ system';
            } elseif (stripos($lowText, 'circuit') !== false || stripos($lowText, 'computer') !== false || stripos($lowText, 'generation') !== false) {
                $replacement = 'Integrated circuits (ICs)';
            } elseif (stripos($lowText, 'microprocessor') !== false) {
                $replacement = 'Microprocessors';
            } elseif (stripos($lowText, 'vacuum tube') !== false) {
                $replacement = 'Vacuum tubes';
            } elseif (stripos($lowText, 'teacher') !== false || stripos($lowText, 'ges') !== false || stripos($lowText, 'school') !== false) {
                $replacement = 'School Management Committee (SMC)';
            } elseif (stripos($lowText, 'act 1023') !== false || stripos($lowText, 'law') !== false || stripos($lowText, 'policy') !== false) {
                $replacement = 'Ghana Education Service Council (GESC)';
            } else {
                $replacement = 'Structural component';
            }

            $fixedOpts = $options;
            // Replace the second occurrence of duplicate
            $firstSeen = [];
            foreach ($fixedOpts as $idx => $opt) {
                $low = strtolower($opt);
                if (isset($firstSeen[$low])) {
                    $fixedOpts[$idx] = $replacement;
                    break;
                }
                $firstSeen[$low] = true;
            }

            $aiResponse = [
                'hasIssue' => true,
                'issueSummary' => "Duplicate options detected (\"{$duplicateText}\"). Replaced duplicate with distinct alternative distractor.",
                'correctedOptions' => $fixedOpts,
                'correctIndex' => $correctIndex,
                'explanation' => $explanation ?: "Fixed duplicate options to ensure 4 distinct, curriculum-aligned choices."
            ];
        } else {
            $aiResponse = [
                'hasIssue' => false,
                'issueSummary' => 'No duplicate options detected.',
                'correctedOptions' => $options,
                'correctIndex' => $correctIndex,
                'explanation' => $explanation
            ];
        }
    }

    jsonOut([
        'ok' => true,
        'hasIssue' => (bool)($aiResponse['hasIssue'] ?? false),
        'issueSummary' => $aiResponse['issueSummary'] ?? 'Audit completed',
        'fix' => [
            'correctedOptions' => $aiResponse['correctedOptions'] ?? $options,
            'correctIndex' => (int)($aiResponse['correctIndex'] ?? $correctIndex),
            'explanation' => $aiResponse['explanation'] ?? $explanation
        ]
    ]);
}

// AI Apply Question Fix (POST)
if ($route === 'ai/apply-fix' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $id = trim((string)($b['questionId'] ?? ''));
    $fixed = is_array($b['fixed'] ?? null) ? $b['fixed'] : [];
    if (!$id || empty($fixed['options']) || count($fixed['options']) !== 4) {
        errorOut('Invalid question fix payload.', 400);
    }

    $foundIdx = null;
    foreach ($db['questions'] as $i => $q) {
        if (($q['id'] ?? '') === $id) {
            $foundIdx = $i;
            break;
        }
    }
    if ($foundIdx === null) errorOut('Question not found in database.', 404);

    $q = $db['questions'][$foundIdx];
    $q['options'] = array_map('trim', $fixed['options']);
    $q['correctIndex'] = (int)($fixed['correctIndex'] ?? $q['correctIndex']);
    if (isset($fixed['explanation'])) $q['explanation'] = trim((string)$fixed['explanation']);
    if (!empty($fixed['text'])) $q['text'] = trim((string)$fixed['text']);
    $q['updatedAt'] = round(microtime(true) * 1000);

    $db['questions'][$foundIdx] = $q;
    saveDb($db);

    jsonOut([
        'ok' => true,
        'message' => 'Question successfully resolved and saved.',
        'question' => $q
    ]);
}

// Candidate AI Tutor Clarification (POST)
if ($route === 'ai/clarify' && $method === 'POST') {
    $b = getJsonBody();
    $q = is_array($b['question'] ?? null) ? $b['question'] : [];
    $text = trim((string)($q['text'] ?? ''));
    $options = is_array($q['options'] ?? null) ? array_map('trim', $q['options']) : [];
    $correctIndex = (int)($b['correctIndex'] ?? ($q['correctIndex'] ?? 0));
    $studentChosen = isset($b['studentChosen']) && is_numeric($b['studentChosen']) ? (int)$b['studentChosen'] : null;
    $explanation = trim((string)($b['explanation'] ?? ($q['explanation'] ?? '')));
    $studentQuestion = trim((string)($b['studentQuestion'] ?? 'Please explain this question and why this is the correct answer.'));
    $level = trim((string)($b['level'] ?? ''));
    $subjectName = trim((string)($b['subjectName'] ?? 'General Studies'));

    if ($text === '') errorOut('Question text is required for AI clarification.', 400);

    $correctLetter = chr(65 + $correctIndex);
    $correctText = $options[$correctIndex] ?? 'Correct Option';
    $studentChosenText = ($studentChosen !== null && isset($options[$studentChosen]))
        ? chr(65 + $studentChosen) . ") " . $options[$studentChosen]
        : "Unanswered";

    $ai = getAiSettings($db);
    $reply = '';

    if (!empty($ai['apiKey']) && $ai['enabled']) {
        $prompt = "You are Codecastic AI Tutor, an inspiring, polite, and expert Ghanaian teacher helping a student in Ghana prepare for their exams ({$subjectName}, Level: {$level}).
Here is the question details:
Question: {$text}
Options:
A) {$options[0]}
B) {$options[1]}
C) {$options[2]}
D) {$options[3]}
Official Correct Answer: Option {$correctLetter} ({$correctText})
Candidate's Selection: {$studentChosenText}
Official Explanation: {$explanation}

The candidate asks: \"{$studentQuestion}\"

Please reply in a warm, encouraging pedagogical tone in 2 to 3 concise paragraphs. Explain why Option {$correctLetter} is the correct answer, break down the key concept simply, and give a helpful tip for exams.";

        $aiReply = callGeminiApi($prompt, $ai['apiKey'], $ai['model']);
        if ($aiReply) $reply = $aiReply;
    }

    // Educational heuristic response if Gemini key is not entered
    if (!$reply) {
        $reply = "Hello! Here is a breakdown of this question for you:\n\n"
            . "**Correct Answer:** Option {$correctLetter} ({$correctText})\n\n"
            . ($explanation ? "**Explanation:** " . $explanation . "\n\n" : "")
            . "💡 **Key Concept:** Always pay close attention to the specific terms and definitions in your {$subjectName} syllabus. "
            . ($studentChosen !== null && $studentChosen !== $correctIndex
                ? "You selected Option " . chr(65 + $studentChosen) . ", which is commonly confused with the right answer. Notice how Option {$correctLetter} directly satisfies the question requirement."
                : "Great job understanding the core principles behind this question!")
            . "\n\n*(Note: Your administrator can enable full real-time interactive Google Gemini AI in the Admin Panel for customized conversational tutoring!)*";
    }

    jsonOut([
        'ok' => true,
        'reply' => $reply
    ]);
}

// Fallback: 404 for unknown API route
errorOut("Route not found: $method /api/$route", 404);

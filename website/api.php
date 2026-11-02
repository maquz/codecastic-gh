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
    if (!file_exists($dbFile)) {
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
    return $data;
}

function saveDb($data) {
    global $dataDir, $dbFile;
    if (!file_exists($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $tmpFile = $dbFile . '.tmp.' . uniqid();
    file_put_contents($tmpFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmpFile, $dbFile);
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

    // Sanitize for client (remove correctIndex & explanation during quiz)
    $safeQuestions = [];
    foreach ($filtered as $q) {
        $safeQuestions[] = [
            'id' => $q['id'] ?? '',
            'subjectId' => $q['subjectId'] ?? '',
            'level' => $q['level'] ?? '',
            'text' => $q['text'] ?? '',
            'options' => $q['options'] ?? [],
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

    $answers = is_array($b['answers'] ?? null) ? $b['answers'] : [];
    $allQsMap = [];
    foreach ($db['questions'] as $q) {
        if (isset($q['id'])) {
            $allQsMap[$q['id']] = $q;
        }
    }

    $qIds = array_keys($answers);
    $totalQuestions = count($qIds);
    $score = 0;
    $details = [];

    foreach ($qIds as $qid) {
        if (!isset($allQsMap[$qid])) continue;
        $q = $allQsMap[$qid];
        $selected = $answers[$qid];
        $correct = (int)($q['correctIndex'] ?? 0);
        $isCorrect = ($selected !== null && (int)$selected === $correct);
        if ($isCorrect) $score++;

        $details[] = [
            'questionId' => $qid,
            'text' => $q['text'] ?? '',
            'options' => $q['options'] ?? [],
            'selected' => $selected,
            'correctIndex' => $correct,
            'isCorrect' => $isCorrect,
            'explanation' => $q['explanation'] ?? '',
            'year' => $q['year'] ?? null,
            'category' => $q['category'] ?? null
        ];
    }

    $percent = $totalQuestions > 0 ? round(($score / $totalQuestions) * 100) : 0;
    $passed = $percent >= 50;

    $now = round(microtime(true) * 1000);
    $resultRecord = [
        'id' => generateUuid(),
        'userId' => (string)($b['userId'] ?? ''),
        'studentName' => (string)($b['studentName'] ?? 'Candidate'),
        'studentEmail' => (string)($b['studentEmail'] ?? ''),
        'schoolName' => (string)($b['schoolName'] ?? ''),
        'level' => $level,
        'subjectId' => (string)($b['subjectId'] ?? ''),
        'subjectName' => (string)($b['subjectName'] ?? ''),
        'score' => $score,
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
        'totalQuestions' => $totalQuestions,
        'percent' => $percent,
        'passed' => $passed,
        'details' => $details
    ]);
}

// Student Exam History
if ($route === 'student/history' && $method === 'POST') {
    $b = getJsonBody();
    $userId = trim((string)($b['userId'] ?? ''));
    $email = strtolower(trim((string)($b['studentEmail'] ?? '')));

    $matched = [];
    foreach ($db['results'] as $r) {
        $rUserId = trim((string)($r['userId'] ?? ''));
        $rEmail = strtolower(trim((string)($r['studentEmail'] ?? '')));
        if (($userId !== '' && $rUserId === $userId) || ($email !== '' && $rEmail === $email)) {
            $matched[] = $r;
        }
    }

    usort($matched, function($a, $b) {
        return ($b['createdAt'] ?? 0) - ($a['createdAt'] ?? 0);
    });

    $count = count($matched);
    $totalScore = 0;
    $bestPercent = 0;
    foreach ($matched as $m) {
        $p = (int)($m['percent'] ?? 0);
        $totalScore += $p;
        if ($p > $bestPercent) $bestPercent = $p;
    }
    $avgPercent = $count > 0 ? round($totalScore / $count) : 0;

    jsonOut([
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

        $userResults = [];
        foreach ($rawResults as $r) {
            $rUserId = trim((string)($r['userId'] ?? ''));
            $rEmail = strtolower(trim((string)($r['studentEmail'] ?? '')));
            if (($uId !== '' && $rUserId === $uId) || ($uEmail !== '' && $rEmail === $uEmail)) {
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

// Fallback: 404 for unknown API route
errorOut("Route not found: $method /api/$route", 404);

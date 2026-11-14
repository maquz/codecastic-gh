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
    foreach (['subjects', 'questions', 'settings', 'users', 'sessions', 'results', 'messages', 'schools', 'quiz_assignments'] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key])) {
            $data[$key] = [];
        }
    }

    // Smart-merge newly added questions and subjects from seed.json without touching candidates/results
    $seedFile = $dataDir . '/seed.json';
    if (file_exists($seedFile)) {
        $seedRaw = @file_get_contents($seedFile);
        $seedData = json_decode($seedRaw, true);
        $needsSave = false;

        // Smart-merge subjects
        if (is_array($seedData) && !empty($seedData['subjects'])) {
            $existingSubMap = [];
            foreach ($data['subjects'] as $es) {
                if (!empty($es['name'])) $existingSubMap[strtolower(trim($es['name']))] = true;
                if (!empty($es['id'])) $existingSubMap[$es['id']] = true;
            }
            foreach ($seedData['subjects'] as $ss) {
                $sName = strtolower(trim((string)($ss['name'] ?? '')));
                $sId = (string)($ss['id'] ?? '');
                if ($sName !== '' && !isset($existingSubMap[$sName]) && !isset($existingSubMap[$sId])) {
                    $data['subjects'][] = $ss;
                    $existingSubMap[$sName] = true;
                    $existingSubMap[$sId] = true;
                    $needsSave = true;
                }
            }
        }

        // Smart-merge questions
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
                    $needsSave = true;
                }
            }
        }

        if ($needsSave) {
            saveDb($data, false);
        }
    }

    // Deduplicate subjects by normalized name (case-insensitive)
    $cleanSubjects = [];
    $seenSubNames = [];
    $idRemap = [];
    $hasDupes = false;

    foreach ($data['subjects'] as $s) {
        $subId = (string)($s['id'] ?? '');
        $subName = trim((string)($s['name'] ?? ''));
        if ($subName === '') continue;
        $norm = strtolower($subName);

        if (!isset($seenSubNames[$norm])) {
            $seenSubNames[$norm] = $subId;
            $cleanSubjects[] = ['id' => $subId, 'name' => $subName];
        } else {
            $hasDupes = true;
            $primaryId = $seenSubNames[$norm];
            if ($subId !== $primaryId && $subId !== '') {
                $idRemap[$subId] = $primaryId;
            }
        }
    }

    if ($hasDupes) {
        $data['subjects'] = $cleanSubjects;
        if (!empty($idRemap) && !empty($data['questions'])) {
            foreach ($data['questions'] as &$q) {
                $qSubj = $q['subjectId'] ?? '';
                if (isset($idRemap[$qSubj])) {
                    $q['subjectId'] = $idRemap[$qSubj];
                }
            }
            unset($q);
        }
        saveDb($data, false);
    }

    // Ensure all Professional Studies questions are routed to GTLE only
    $profStudiesSubjectIds = ['62b4e383-5d17-4489-a187-35d7423f2bba'];
    foreach ($data['subjects'] as $s) {
        if (stripos($s['name'] ?? '', 'professional studies') !== false) {
            $profStudiesSubjectIds[] = $s['id'] ?? '';
        }
    }
    $psChanged = false;
    foreach ($data['questions'] as &$q) {
        $subjId = $q['subjectId'] ?? '';
        if (in_array($subjId, $profStudiesSubjectIds, true) && ($q['level'] ?? '') !== 'GTLE') {
            $q['level'] = 'GTLE';
            $psChanged = true;
        }
    }
    unset($q);
    if ($psChanged) {
        saveDb($data, false);
    }

    return $data;
}

function isProfessionalStudiesSubject($db, $subjectId) {
    if (!$subjectId) return false;
    if ($subjectId === '62b4e383-5d17-4489-a187-35d7423f2bba') return true;
    if (!empty($db['subjects']) && is_array($db['subjects'])) {
        foreach ($db['subjects'] as $s) {
            if (($s['id'] ?? '') === $subjectId) {
                $name = strtolower(trim((string)($s['name'] ?? '')));
                return (strpos($name, 'professional studies') !== false);
            }
        }
    }
    return false;
}

function saveDb($data, $makeBackup = true) {
    global $dataDir, $dbFile;
    if (!file_exists($dataDir)) {
        @mkdir($dataDir, 0777, true);
    }
    @chmod($dataDir, 0777);

    // Encode JSON with fallback for malformed UTF-8 characters
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        $json = json_encode($data, JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }
    if ($json === false) {
        return false;
    }

    if (file_exists($dbFile)) {
        @chmod($dbFile, 0666);
    }

    $saved = false;

    // 1. Try direct write with LOCK_EX
    $bytes = @file_put_contents($dbFile, $json, LOCK_EX);
    if ($bytes !== false) {
        $saved = true;
    }

    // 2. Try direct write WITHOUT lock (crucial on cPanel shared hosts / CageFS / NFS)
    if (!$saved) {
        $bytes = @file_put_contents($dbFile, $json);
        if ($bytes !== false) {
            $saved = true;
        }
    }

    // 3. Try standard fopen/fwrite with flush
    if (!$saved) {
        $fp = @fopen($dbFile, 'wb');
        if ($fp) {
            $written = @fwrite($fp, $json);
            @fflush($fp);
            @fclose($fp);
            if ($written !== false) {
                $saved = true;
            }
        }
    }

    // 4. Fallback: temp file write and copy/rename
    if (!$saved) {
        $tmpFile = $dataDir . '/temp_' . uniqid() . '.json';
        if (@file_put_contents($tmpFile, $json) !== false) {
            @chmod($tmpFile, 0666);
            if (@copy($tmpFile, $dbFile) || @rename($tmpFile, $dbFile)) {
                $saved = true;
            }
            @unlink($tmpFile);
        }
    }

    if ($saved) {
        @chmod($dbFile, 0666);

        // Keep seed.json synced with subjects so newly added subjects are never lost across seed updates
        $seedFile = $dataDir . '/seed.json';
        if (file_exists($seedFile) && !empty($data['subjects'])) {
            @chmod($seedFile, 0666);
            $seedRaw = @file_get_contents($seedFile);
            $seedData = json_decode($seedRaw, true);
            if (is_array($seedData)) {
                $seedData['subjects'] = $data['subjects'];
                @file_put_contents($seedFile, json_encode($seedData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            }
        }

        // Automatic rolling daily backup to protect candidate records permanently
        if ($makeBackup) {
            $backupDir = $dataDir . '/backups';
            if (!file_exists($backupDir)) {
                @mkdir($backupDir, 0777, true);
            }
            $todayBackup = $backupDir . '/db-backup-' . date('Y-m-d') . '.json';
            if (!file_exists($todayBackup)) {
                @copy($dbFile, $todayBackup);
            }
        }
    }

    return $saved;
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
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function errorOut($message, $code = 400) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
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
    if ($s === '' || strtolower($s) === 'assignment' || str_starts_with(strtolower($s), 'asgn')) return null;
    $u = strtoupper($s);
    if ($u === 'ADMIN') return 8;
    if (ctype_digit($s)) {
        $n = (int)$s;
        return in_array($n, $SCHOOL_LEVELS, true) ? $n : null;
    }
    if (preg_match('/^(?:basic|grade|class|b|primary|p)\s*(\d+)/i', $s, $m)) {
        $n = (int)$m[1];
        return in_array($n, $SCHOOL_LEVELS, true) ? $n : null;
    }
    if (preg_match('/^(?:shs|form)\s*([1-3])/i', $s, $m)) {
        return 'SHS ' . $m[1];
    }
    if ($u === 'SHS' || $u === 'SHS 1 - 3' || $u === 'SHS 1-3') return 'SHS 1';
    if (str_contains($u, 'GES PROMOTION') || $u === 'GES-PROMO' || str_contains($u, 'PROMOTION')) return 'GES-PROMO';
    if (str_contains($u, 'WASSCE')) return 'WASSCE';
    if (str_contains($u, 'BECE')) return 'BECE';
    if (str_contains($u, 'GTLE')) return 'GTLE';
    foreach ($SHS_LEVELS as $shs) {
        if (str_contains($u, $shs)) return $shs;
    }
    if (preg_match('/\b([4-9])\b/', $s, $dm)) {
        $n = (int)$dm[1];
        if (in_array($n, $SCHOOL_LEVELS, true)) return $n;
    }
    return in_array($u, $TRACKS, true) ? $u : null;
}

$DEFAULT_TIMERS = [
    'ges-promotion' => 60,
    'basic' => 60,
    'bece' => 60,
    'shs' => 60,
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
function isSuperAdminEmail($email) {
    return strtolower(trim((string)$email)) === 'anibrikamark@gmail.com';
}

function isSuperAdminUser($user) {
    if (!$user || !is_array($user)) return false;
    if (isSuperAdminEmail($user['email'] ?? '')) return true;
    $r = (string)($user['adminRole'] ?? ($user['role'] ?? ''));
    return $r === 'superadmin';
}

function isTeacherRecord($u) {
    if (!$u || !is_array($u)) return false;
    if (($u['role'] ?? '') === 'teacher') return true;
    if (($u['accountType'] ?? '') === 'teacher') return true;
    if (!empty($u['isTeacher'])) return true;
    if (($u['gradeLevel'] ?? '') === 'TEACHER') return true;
    if (!empty($u['assignedSubjects']) && is_array($u['assignedSubjects']) && count($u['assignedSubjects']) > 0) return true;
    if (!empty($u['assignedLevels']) && is_array($u['assignedLevels']) && count($u['assignedLevels']) > 0) return true;
    if (!empty($u['teacherCode'])) return true;
    return false;
}

function isSchoolAdminRecord($u) {
    if (!$u || !is_array($u)) return false;
    return (($u['role'] ?? '') === 'school_admin') || (($u['accountType'] ?? '') === 'school_admin');
}

function matchesSchool($u, $schoolId, $schoolCode = '', $schoolName = '') {
    if (!$u || !is_array($u)) return false;
    $uSchoolId = (string)($u['schoolId'] ?? '');
    $uSchoolCode = (string)($u['schoolCode'] ?? '');
    $uSchoolName = (string)($u['schoolName'] ?? '');

    if ($schoolId !== '' && $uSchoolId !== '' && $uSchoolId === $schoolId) return true;
    if ($schoolCode !== '' && $uSchoolCode !== '' && strtolower($uSchoolCode) === strtolower($schoolCode)) return true;
    if ($schoolName !== '' && $uSchoolName !== '' && strtolower($uSchoolName) === strtolower($schoolName)) return true;
    return false;
}

function publicUser($u) {
    $em = strtolower(trim((string)($u['email'] ?? '')));
    $isSuper = isSuperAdminEmail($em) || ($u['adminRole'] ?? '') === 'superadmin' || ($u['role'] ?? '') === 'superadmin';
    $adminRole = $isSuper ? 'superadmin' : (string)($u['adminRole'] ?? '');
    if ($adminRole === '' && in_array($u['role'] ?? '', ['admin', 'editor'], true)) {
        $adminRole = $u['role'];
    }

    $isTeacher = isTeacherRecord($u);
    $isSchoolAdmin = isSchoolAdminRecord($u);

    // If teacher, maintain teacher role so school rosters, classes, and teacher views are never lost
    $role = (string)($u['role'] ?? (($u['accountType'] ?? '') === 'ges-promo' ? 'ges-promo' : 'student'));
    if ($isTeacher) {
        $role = 'teacher';
    } elseif ($isSchoolAdmin) {
        $role = 'school_admin';
    } elseif ($isSuper) {
        $role = 'superadmin';
    } elseif ($adminRole === 'admin') {
        $role = 'admin';
    } elseif ($adminRole === 'editor') {
        $role = 'editor';
    }

    $accountType = $isTeacher ? 'teacher' : ($isSchoolAdmin ? 'school_admin' : (($u['accountType'] ?? '') === 'ges-promo' ? 'ges-promo' : 'student'));

    return [
        'id' => (string)($u['id'] ?? ''),
        'name' => (string)($u['name'] ?? ''),
        'email' => (string)($u['email'] ?? ''),
        'role' => $role,
        'adminRole' => $adminRole ?: null,
        'isSuperAdmin' => $isSuper,
        'isTeacher' => $isTeacher,
        'accountType' => $accountType,
        'schoolId' => (string)($u['schoolId'] ?? ''),
        'schoolName' => (string)($u['schoolName'] ?? ''),
        'schoolCode' => (string)($u['schoolCode'] ?? ''),
        'studentCode' => (string)($u['studentCode'] ?? ''),
        'teacherCode' => (string)($u['teacherCode'] ?? ''),
        'gradeLevel' => (($u['gradeLevel'] ?? '') === 'ADMIN' || ($u['gradeLevel'] ?? '') === 'admin') ? 8 : ($u['gradeLevel'] ?? 4),
        'classSection' => (string)($u['classSection'] ?? ''),
        'assignedSubjects' => is_array($u['assignedSubjects'] ?? null) ? $u['assignedSubjects'] : [],
        'assignedLevels' => is_array($u['assignedLevels'] ?? null) ? $u['assignedLevels'] : [],
        'region' => (string)($u['region'] ?? ''),
        'promotionRank' => (string)($u['promotionRank'] ?? ''),
        'gender' => (string)($u['gender'] ?? '')
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

function isSuperAdmin($db, $code) {
    if (empty($code)) return false;
    $saved = getAdminCode($db);
    if (!empty($saved) && is_string($code) && $code === $saved) return true;
    $u = getUserByToken($db, $code);
    return isSuperAdminUser($u);
}

function isAdmin($db, $code) {
    if (empty($code)) return false;
    $saved = getAdminCode($db);
    if (!empty($saved) && is_string($code) && $code === $saved) return true;
    $u = getUserByToken($db, $code);
    if (!$u) return false;
    if (isSuperAdminUser($u)) return true;
    $r = (string)($u['adminRole'] ?? ($u['role'] ?? ''));
    return in_array($r, ['admin', 'superadmin'], true);
}

function isEditor($db, $code) {
    if (empty($code)) return false;
    if (isAdmin($db, $code)) return true;
    $u = getUserByToken($db, $code);
    if (!$u) return false;
    $r = (string)($u['adminRole'] ?? ($u['role'] ?? ''));
    return in_array($r, ['editor', 'admin', 'superadmin'], true);
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

    $recordCount = function($key, $yr, $cat) use (&$counts, &$yearsMap, &$categoriesMap, &$yearCounts, &$categoryCounts) {
        $counts[$key] = ($counts[$key] ?? 0) + 1;
        
        if ($yr !== '') {
            if (!isset($yearsMap[$key])) $yearsMap[$key] = [];
            if (!in_array($yr, $yearsMap[$key], true)) $yearsMap[$key][] = $yr;
            $yKey = $key . '|' . $yr;
            $yearCounts[$yKey] = ($yearCounts[$yKey] ?? 0) + 1;
        }

        if ($cat !== '') {
            if (!isset($categoriesMap[$key])) $categoriesMap[$key] = [];
            if (!in_array($cat, $categoriesMap[$key], true)) $categoriesMap[$key][] = $cat;
            $cKey = $key . '|' . $cat;
            $categoryCounts[$cKey] = ($categoryCounts[$cKey] ?? 0) + 1;
        }
    };

    foreach ($qs as $q) {
        $subId = $q['subjectId'] ?? '';
        $lvl = (string)($q['level'] ?? '');
        $yr = trim((string)($q['year'] ?? ''));
        $cat = trim((string)($q['category'] ?? ''));

        $recordCount($subId . '|' . $lvl, $yr, $cat);

        // JHS & BECE cross-linking: BECE questions contribute to Basic 7, 8, 9, and vice versa
        if (strtoupper($lvl) === 'BECE') {
            foreach ([7, 8, 9] as $jl) {
                $recordCount($subId . '|' . $jl, $yr, $cat);
            }
        } elseif (in_array($lvl, ['7', '8', '9'], true)) {
            $recordCount($subId . '|BECE', $yr, $cat);
            foreach ([7, 8, 9] as $jl) {
                if ((string)$jl !== $lvl) {
                    $recordCount($subId . '|' . $jl, $yr, $cat);
                }
            }
        }

        // Primary (4, 5, 6) cross-linking: Primary level questions available across Basic 4-6
        if (in_array($lvl, ['4', '5', '6'], true)) {
            foreach ([4, 5, 6] as $pl) {
                if ((string)$pl !== $lvl) {
                    $recordCount($subId . '|' . $pl, $yr, $cat);
                }
            }
        }

        // SHS & WASSCE cross-linking: WASSCE questions contribute to SHS 1-3, and vice versa
        if (strtoupper($lvl) === 'WASSCE') {
            foreach (['SHS 1', 'SHS 2', 'SHS 3', 'SHS'] as $sl) {
                $recordCount($subId . '|' . $sl, $yr, $cat);
            }
        } elseif (in_array($lvl, ['SHS 1', 'SHS 2', 'SHS 3', 'SHS'], true)) {
            $recordCount($subId . '|WASSCE', $yr, $cat);
            foreach (['SHS 1', 'SHS 2', 'SHS 3', 'SHS'] as $sl) {
                if ($sl !== $lvl) {
                    $recordCount($subId . '|' . $sl, $yr, $cat);
                }
            }
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

// GET /api/exam/assignment/:id (or /api/assignment/:id)
if (preg_match('#^(?:exam/)?assignment/([^/]+)/?$#', $route, $mMatches) && $method === 'GET') {
    $asgnId = (string)$mMatches[1];
    $allAssignments = is_array($db['quiz_assignments'] ?? null) ? $db['quiz_assignments'] : [];

    $asgn = null;
    foreach ($allAssignments as $a) {
        if ((string)($a['id'] ?? '') === $asgnId) {
            $asgn = $a;
            break;
        }
    }

    if (!$asgn) errorOut('Assignment not found', 404);

    $qIdLookup = array_flip(is_array($asgn['questionIds'] ?? null) ? array_map('strval', $asgn['questionIds']) : []);
    $questions = [];

    foreach ($db['questions'] as $q) {
        $qid = (string)($q['id'] ?? '');
        if (isset($qIdLookup[$qid])) {
            $questions[] = [
                'id' => $qid,
                'text' => (string)($q['text'] ?? ''),
                'options' => is_array($q['options'] ?? null) ? $q['options'] : [],
                'correctIndex' => isset($q['correctIndex']) ? (int)$q['correctIndex'] : 0,
                'explanation' => (string)($q['explanation'] ?? ''),
                'category' => $q['category'] ?? null,
                'year' => $q['year'] ?? null
            ];
        }
    }

    // Shuffle questions so students taking assigned quizzes get a fresh randomized order
    shuffle($questions);

    jsonOut([
        'ok' => true,
        'assignment' => [
            'id' => $asgn['id'],
            'title' => $asgn['title'] ?? '',
            'subjectName' => $asgn['subjectName'] ?? '',
            'subjectId' => $asgn['subjectId'] ?? '',
            'gradeLevel' => $asgn['gradeLevel'] ?? '',
            'timerSeconds' => $asgn['timerSeconds'] ?? 60,
            'teacherName' => $asgn['teacherName'] ?? 'Teacher',
            'questionCount' => count($questions),
            'questions' => $questions
        ]
    ]);
}

// Exam Fetch: exam/:level/:subjectId
if (preg_match('#^exam/([^/]+)/([^/]+)$#', $route, $matches) && strtolower($matches[1]) !== 'assignment' && $method === 'GET') {
    $rawLevel = urldecode($matches[1]);
    $subjectId = urldecode($matches[2]);
    $level = normLevel($rawLevel);
    if ($level === null) errorOut('Invalid level', 400);

    $allQs = [];
    $isPrimary = in_array((string)$level, ['4', '5', '6'], true);
    $isJhsOrBece = in_array((string)$level, ['7', '8', '9', 'BECE'], true);
    $isShsOrWassce = in_array((string)$level, ['SHS 1', 'SHS 2', 'SHS 3', 'WASSCE', 'SHS'], true);

    foreach ($db['questions'] as $q) {
        if (($q['subjectId'] ?? '') !== $subjectId) continue;
        $qLvl = (string)($q['level'] ?? '');
        $match = false;
        if ($qLvl == (string)$level) {
            $match = true;
        } elseif ($isJhsOrBece && ($qLvl === 'BECE' || in_array($qLvl, ['7', '8', '9'], true))) {
            // BECE / JHS mock & past questions accessible across Basic 7-9
            $match = true;
        } elseif ($isPrimary && in_array($qLvl, ['4', '5', '6'], true)) {
            // Primary mock & past questions accessible across Basic 4-6
            $match = true;
        } elseif ($isShsOrWassce && ($qLvl === 'WASSCE' || in_array($qLvl, ['SHS 1', 'SHS 2', 'SHS 3', 'SHS'], true))) {
            // WASSCE mock/past questions accessible across SHS 1-3
            $match = true;
        }
        if ($match) {
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

    // Randomize and shuffle the question pool so learners get fresh, varied questions every session
    shuffle($filtered);

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
    $u = getUserByToken($db, $b['token'] ?? null);
    $rawLevel = $b['level'] ?? '';
    $level = normLevel($rawLevel);
    if ($level === null) {
        $level = normLevel($u['gradeLevel'] ?? null) ?? 8;
    }

    // Resolve user from token or payload
    $userId = $u ? (string)$u['id'] : trim((string)($b['userId'] ?? ''));
    $studentName = $u ? (string)$u['name'] : trim((string)($b['studentName'] ?? 'Candidate'));
    $studentEmail = $u ? (string)$u['email'] : trim((string)($b['studentEmail'] ?? ''));
    $schoolName = $u ? (string)($u['schoolName'] ?? '') : trim((string)($b['schoolName'] ?? ''));

    // If an assignment was submitted, resolve its details if needed
    if (!empty($b['assignmentId'])) {
        $asgnId = (string)$b['assignmentId'];
        $allAssignments = is_array($db['quiz_assignments'] ?? null) ? $db['quiz_assignments'] : [];
        foreach ($allAssignments as $asgn) {
            if ((string)($asgn['id'] ?? '') === $asgnId) {
                if (!empty($asgn['gradeLevel']) && normLevel($asgn['gradeLevel']) !== null) {
                    $level = normLevel($asgn['gradeLevel']);
                }
                if (empty($b['subjectName']) && !empty($asgn['subjectName'])) {
                    $b['subjectName'] = $asgn['subjectName'];
                }
                break;
            }
        }
    }

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

    // Official WAEC BECE Stanine Grading (Applied strictly for 100 questions sitting)
    $beceGrade = null;
    $beceGradeValue = null;
    $beceRemark = null;
    if ($totalQuestions === 100) {
        if ($percent >= 90) {
            $beceGrade = 'Grade 1';
            $beceGradeValue = 1;
            $beceRemark = 'Highest Distinction';
        } elseif ($percent >= 80) {
            $beceGrade = 'Grade 2';
            $beceGradeValue = 2;
            $beceRemark = 'Higher Distinction';
        } elseif ($percent >= 70) {
            $beceGrade = 'Grade 3';
            $beceGradeValue = 3;
            $beceRemark = 'High Pass';
        } elseif ($percent >= 60) {
            $beceGrade = 'Grade 4';
            $beceGradeValue = 4;
            $beceRemark = 'Pass';
        } elseif ($percent >= 55) {
            $beceGrade = 'Grade 5';
            $beceGradeValue = 5;
            $beceRemark = 'Pass';
        } elseif ($percent >= 50) {
            $beceGrade = 'Grade 6';
            $beceGradeValue = 6;
            $beceRemark = 'Standard Pass';
        } elseif ($percent >= 40) {
            $beceGrade = 'Grade 7';
            $beceGradeValue = 7;
            $beceRemark = 'Pass';
        } elseif ($percent >= 35) {
            $beceGrade = 'Grade 8';
            $beceGradeValue = 8;
            $beceRemark = 'Pass';
        } else {
            $beceGrade = 'Grade 9';
            $beceGradeValue = 9;
            $beceRemark = 'Remedial';
        }
    }

    $now = round(microtime(true) * 1000);
    $resultRecord = [
        'id' => generateUuid(),
        'userId' => $userId,
        'studentName' => $studentName,
        'studentEmail' => $studentEmail,
        'schoolId' => $u ? (string)($u['schoolId'] ?? '') : (string)($b['schoolId'] ?? ''),
        'schoolName' => $schoolName,
        'classSection' => $u ? (string)($u['classSection'] ?? '') : (string)($b['classSection'] ?? ''),
        'level' => $level,
        'subjectId' => $subjId,
        'subjectName' => $subjectName,
        'score' => $score,
        'total' => $totalQuestions,
        'totalQuestions' => $totalQuestions,
        'percent' => $percent,
        'passed' => $passed,
        'beceGrade' => $beceGrade,
        'beceGradeValue' => $beceGradeValue,
        'beceRemark' => $beceRemark,
        'details' => $details,
        'assignmentId' => !empty($b['assignmentId']) ? (string)$b['assignmentId'] : null,
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
        'beceGrade' => $beceGrade,
        'beceGradeValue' => $beceGradeValue,
        'beceRemark' => $beceRemark,
        'review' => $review,
        'details' => $details
    ]);
}

// Offline Question Pack: GET|POST /api/offline/pack
if ($route === 'offline/pack' && ($method === 'GET' || $method === 'POST')) {
    $reqLevel = $_GET['level'] ?? ($_POST['level'] ?? '');
    $reqTrack = $_GET['track'] ?? ($_POST['track'] ?? '');

    $normLvl = normLevel($reqLevel);
    $track = trim((string)$reqTrack);

    $matchedQuestions = [];
    $isJhsOrBece = in_array((string)$normLvl, ['7', '8', '9', 'BECE'], true) || $track === 'basic' || $track === 'bece';
    $isShsOrWassce = in_array((string)$normLvl, ['SHS 1', 'SHS 2', 'SHS 3', 'WASSCE', 'SHS'], true) || $track === 'shs' || $track === 'wassce';
    $isGtle = ($normLvl === 'GTLE' || $track === 'gtle');
    $isGes = ($normLvl === 'GES-PROMO' || $track === 'ges-promotion');

    foreach ($db['questions'] as $q) {
        $qLvl = (string)($q['level'] ?? '');
        $match = false;
        if ($normLvl !== null && $qLvl == (string)$normLvl) {
            $match = true;
        } elseif ($isJhsOrBece && in_array($qLvl, ['4', '5', '6', '7', '8', '9', 'BECE'], true)) {
            $match = true;
        } elseif ($isShsOrWassce && in_array($qLvl, ['SHS 1', 'SHS 2', 'SHS 3', 'WASSCE', 'SHS'], true)) {
            $match = true;
        } elseif ($isGtle && $qLvl === 'GTLE') {
            $match = true;
        } elseif ($isGes && in_array($qLvl, ['GES-PROMO', 'AD II', 'AD I', 'DD', 'DIR II', 'DIR I'], true)) {
            $match = true;
        } elseif ($normLvl === null && empty($track)) {
            $match = true;
        }
        if ($match) {
            $matchedQuestions[] = [
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
    }

    $safeSubjects = [];
    foreach ($db['subjects'] as $s) {
        $safeSubjects[] = [
            'id' => $s['id'] ?? '',
            'name' => $s['name'] ?? ''
        ];
    }

    jsonOut([
        'ok' => true,
        'track' => $track,
        'level' => $normLvl,
        'subjects' => $safeSubjects,
        'questions' => $matchedQuestions,
        'totalQuestions' => count($matchedQuestions),
        'timers' => $db['timers'] ?? [],
        'generatedAt' => round(microtime(true) * 1000)
    ]);
}

// Offline Batch Sync: POST /api/offline/sync-batch
if ($route === 'offline/sync-batch' && $method === 'POST') {
    $b = getJsonBody();
    $submissions = is_array($b['submissions'] ?? null) ? $b['submissions'] : [];
    if (empty($submissions)) {
        jsonOut(['ok' => true, 'syncedCount' => 0, 'message' => 'No submissions to sync']);
    }

    $existingIds = [];
    foreach ($db['results'] as $r) {
        if (isset($r['id'])) $existingIds[$r['id']] = true;
    }

    $synced = [];
    $schoolCodesMap = [];
    foreach (($db['schools'] ?? []) as $sc) {
        if (isset($sc['code']) && isset($sc['id'])) {
            $schoolCodesMap[strtoupper(trim($sc['code']))] = $sc;
        }
    }

    foreach ($submissions as $sub) {
        $subId = trim((string)($sub['id'] ?? ''));
        if ($subId === '') $subId = generateUuid();
        if (isset($existingIds[$subId])) {
            $synced[] = $subId;
            continue;
        }

        $code = strtoupper(trim((string)($sub['schoolCode'] ?? '')));
        $schoolId = trim((string)($sub['schoolId'] ?? ''));
        $schoolName = trim((string)($sub['schoolName'] ?? ''));
        if (isset($schoolCodesMap[$code])) {
            $schoolId = $schoolCodesMap[$code]['id'];
            if ($schoolName === '') $schoolName = $schoolCodesMap[$code]['name'];
        }

        $record = [
            'id' => $subId,
            'userId' => (string)($sub['userId'] ?? ''),
            'studentName' => (string)($sub['studentName'] ?? 'Candidate'),
            'studentEmail' => (string)($sub['studentEmail'] ?? ''),
            'schoolId' => $schoolId,
            'schoolName' => $schoolName,
            'classSection' => (string)($sub['classSection'] ?? ''),
            'level' => normLevel($sub['level'] ?? '') ?? $sub['level'],
            'subjectId' => (string)($sub['subjectId'] ?? ''),
            'subjectName' => (string)($sub['subjectName'] ?? 'Subject'),
            'score' => (int)($sub['score'] ?? 0),
            'total' => (int)($sub['total'] ?? 0),
            'totalQuestions' => (int)($sub['total'] ?? 0),
            'percent' => (int)($sub['percent'] ?? 0),
            'passed' => !empty($sub['passed']),
            'details' => is_array($sub['details'] ?? null) ? $sub['details'] : [],
            'createdAt' => (int)($sub['timestamp'] ?? round(microtime(true) * 1000)),
            'syncedAt' => round(microtime(true) * 1000),
            'offlineOrigin' => true
        ];

        $db['results'][] = $record;
        $existingIds[$subId] = true;
        $synced[] = $subId;
    }

    saveDb($db);
    jsonOut([
        'ok' => true,
        'syncedCount' => count($synced),
        'syncedIds' => $synced
    ]);
}

// School Lab Import: POST /api/school/lab/import
if ($route === 'school/lab/import' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    $results = is_array($b['results'] ?? null) ? $b['results'] : [];
    if (empty($results) && isset($b['data']) && is_array($b['data']['results'] ?? null)) {
        $results = $b['data']['results'];
    }

    if (empty($results)) {
        errorOut('No test results found in payload', 400);
    }

    $existingIds = [];
    foreach ($db['results'] as $r) {
        if (isset($r['id'])) $existingIds[$r['id']] = true;
    }

    $importedCount = 0;
    $targetSchoolId = $u ? ($u['schoolId'] ?? '') : ($b['schoolId'] ?? '');
    $targetSchoolName = $u ? ($u['schoolName'] ?? '') : ($b['schoolName'] ?? '');

    foreach ($results as $item) {
        $itemId = trim((string)($item['id'] ?? ''));
        if ($itemId === '') $itemId = generateUuid();
        if (isset($existingIds[$itemId])) continue;

        $rec = [
            'id' => $itemId,
            'userId' => (string)($item['userId'] ?? ''),
            'studentName' => (string)($item['studentName'] ?? 'Candidate'),
            'studentEmail' => (string)($item['studentEmail'] ?? ''),
            'schoolId' => $targetSchoolId ?: ($item['schoolId'] ?? ''),
            'schoolName' => $targetSchoolName ?: ($item['schoolName'] ?? ''),
            'classSection' => (string)($item['classSection'] ?? ''),
            'level' => normLevel($item['level'] ?? '') ?? $item['level'],
            'subjectId' => (string)($item['subjectId'] ?? ''),
            'subjectName' => (string)($item['subjectName'] ?? 'Subject'),
            'score' => (int)($item['score'] ?? 0),
            'total' => (int)($item['total'] ?? 0),
            'totalQuestions' => (int)($item['total'] ?? 0),
            'percent' => (int)($item['percent'] ?? 0),
            'passed' => !empty($item['passed']),
            'details' => is_array($item['details'] ?? null) ? $item['details'] : [],
            'createdAt' => (int)($item['timestamp'] ?? round(microtime(true) * 1000)),
            'importedAt' => round(microtime(true) * 1000),
            'importedFromLab' => true
        ];

        $db['results'][] = $rec;
        $existingIds[$itemId] = true;
        $importedCount++;
    }

    saveDb($db);
    jsonOut([
        'ok' => true,
        'importedCount' => $importedCount,
        'message' => "Successfully imported $importedCount lab test attempts."
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

    // Optional School linkage via schoolCode or selected school
    $schoolId = trim((string)($b['schoolId'] ?? ''));
    $schoolCode = trim((string)($b['schoolCode'] ?? ''));
    $classSection = trim((string)($b['classSection'] ?? ''));

    if (!empty($db['schools']) && is_array($db['schools'])) {
        foreach ($db['schools'] as $sch) {
            if ($schoolId !== '' && ($sch['id'] ?? '') === $schoolId) {
                $schoolName = $sch['name'] ?? $schoolName;
                $schoolCode = $sch['code'] ?? $schoolCode;
                break;
            } elseif ($schoolCode !== '' && (strcasecmp((string)($sch['code'] ?? ''), $schoolCode) === 0 || strcasecmp((string)($sch['name'] ?? ''), $schoolCode) === 0)) {
                $schoolId = $sch['id'];
                $schoolName = $sch['name'];
                $schoolCode = $sch['code'];
                break;
            }
        }
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
        'role' => $accountType === 'ges-promo' ? 'ges-promo' : 'student',
        'accountType' => $accountType,
        'schoolId' => $schoolId,
        'schoolName' => $schoolName,
        'schoolCode' => $schoolCode,
        'gradeLevel' => $gradeLevel,
        'classSection' => $classSection,
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
    $schoolCode = strtoupper(trim((string)($b['schoolCode'] ?? '')));
    $studentIdentifier = trim((string)($b['studentIdentifier'] ?? ($b['studentName'] ?? ($b['name'] ?? ''))));
    $password = (string)($b['password'] ?? '');

    $found = null;

    if ($schoolCode !== '' && $studentIdentifier !== '') {
        // School student login via School Code + Name or Student Code
        foreach ($db['users'] as $u) {
            $uSchoolCode = strtoupper(trim((string)($u['schoolCode'] ?? '')));
            if ($uSchoolCode === $schoolCode) {
                $uName = strtolower(trim((string)($u['name'] ?? '')));
                $uCode = strtolower(trim((string)($u['studentCode'] ?? '')));
                $uId = strtolower(trim((string)($u['id'] ?? '')));
                $uEmail = strtolower(trim((string)($u['email'] ?? '')));
                $identLower = strtolower($studentIdentifier);

                if ($uName === $identLower || $uCode === $identLower || $uId === $identLower || $uEmail === $identLower) {
                    $found = $u;
                    break;
                }
            }
        }
        if (!$found) {
            errorOut('Student not found for school code ' . $schoolCode . '. Please verify your name or student ID.', 404);
        }
        if ($password !== '' && $password !== 'Student2026#' && !verifyUserPassword($password, $found)) {
            errorOut('Incorrect password. Default password is Student2026#', 401);
        }
    } else {
        if ($email === '' || $password === '') errorOut('Enter your email/school code and password', 400);

        foreach ($db['users'] as $u) {
            if (strtolower(trim((string)($u['email'] ?? ''))) === $email || strtolower(trim((string)($u['studentCode'] ?? ''))) === $email) {
                $found = $u;
                break;
            }
        }

        if (!$found || !verifyUserPassword($password, $found)) {
            errorOut('Invalid email or password', 401);
        }
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

// User Change Password (POST /api/user/change-password)
if ($route === 'user/change-password' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u) errorOut('Not authorised', 401);

    $oldPassword = (string)($b['oldPassword'] ?? '');
    $newPassword = (string)($b['newPassword'] ?? '');

    if (strlen($newPassword) < 6) {
        errorOut('New password must be at least 6 characters long', 400);
    }

    if (!empty($u['passwordPlain']) || !empty($u['passwordHash'])) {
        if (!verifyUserPassword($oldPassword, $u)) {
            errorOut('Current password is incorrect', 401);
        }
    }

    $uid = $u['id'];
    foreach ($db['users'] as &$usr) {
        if (($usr['id'] ?? '') === $uid) {
            $usr['passwordPlain'] = $newPassword;
            $usr['passwordHash'] = password_hash($newPassword, PASSWORD_BCRYPT);
            $usr['updatedAt'] = round(microtime(true) * 1000);
            break;
        }
    }
    unset($usr);
    saveDb($db);
    jsonOut(['ok' => true, 'message' => 'Password changed successfully']);
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
    $pass = $b['passcode'] ?? null;
    if (!isEditor($db, $pass)) errorOut('Incorrect passcode', 401);
    $role = isSuperAdmin($db, $pass) ? 'superadmin' : (isAdmin($db, $pass) ? 'admin' : 'editor');
    jsonOut(['ok' => true, 'role' => $role]);
}

// Admin Subjects - Add
if ($route === 'admin/subjects' && $method === 'POST') {
    $b = getJsonBody();
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $name = trim((string)($b['name'] ?? ''));
    if ($name === '') errorOut('Subject name is required', 400);

    // Check if subject already exists (case-insensitive)
    foreach ($db['subjects'] as $existingSub) {
        if (strcasecmp(trim((string)($existingSub['name'] ?? '')), $name) === 0) {
            jsonOut($existingSub, 200);
        }
    }

    $id = generateUuid();
    $sub = ['id' => $id, 'name' => $name];
    $db['subjects'][] = $sub;
    $saved = saveDb($db);
    if (!$saved) {
        errorOut('Server database write failed: Please ensure "data/db.json" and "data" folder have write permissions in cPanel File Manager (chmod 666 db.json, chmod 777 data).', 500);
    }
    jsonOut($sub, 201);
}

// Admin Subjects - Delete
if (preg_match('#^admin/subjects/([^/]+)/delete$#', $route, $m) && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $subId = $m[1];

    $db['questions'] = array_values(array_filter($db['questions'], function($q) use ($subId) {
        return ($q['subjectId'] ?? '') !== $subId;
    }));

    $db['subjects'] = array_values(array_filter($db['subjects'], function($s) use ($subId) {
        return ($s['id'] ?? '') !== $subId;
    }));

    saveDb($db);
    jsonOut(['ok' => true]);
}

// Admin Questions List
if ($route === 'admin/questions/list' && $method === 'POST') {
    $b = getJsonBody();
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $qs = $db['questions'];
    $cleanQs = [];
    foreach ($qs as $q) {
        $rawOpts = is_array($q['options'] ?? null) ? $q['options'] : [];
        $cleanOpts = [];
        foreach ($rawOpts as $o) {
            $cleanOpts[] = (string)$o;
        }
        $q['options'] = array_values($cleanOpts);
        $cleanQs[] = $q;
    }
    usort($cleanQs, function($a, $b) {
        return ($a['createdAt'] ?? 0) - ($b['createdAt'] ?? 0);
    });
    jsonOut(['questions' => $cleanQs]);
}

// Admin Add Question
if ($route === 'admin/questions' && $method === 'POST') {
    $b = getJsonBody();
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $subjectId = (string)($b['subjectId'] ?? '');
    $level = normLevel($b['level'] ?? null);
    $text = trim((string)($b['text'] ?? ''));
    $options = is_array($b['options'] ?? null) ? array_map('trim', $b['options']) : [];
    $correctIndex = (int)($b['correctIndex'] ?? -1);
    $explanation = trim((string)($b['explanation'] ?? ''));
    $year = trim((string)($b['year'] ?? ''));
    $category = trim((string)($b['category'] ?? ''));
    $rank = trim((string)($b['rank'] ?? ''));

    if ($level === null) errorOut('Choose a valid level', 400);
    if ($text === '') errorOut('Question text is required', 400);
    if (count($options) !== 4 || in_array('', $options, true)) errorOut('Provide all 4 options', 400);
    if ($correctIndex < 0 || $correctIndex > 3) errorOut('Choose the correct answer', 400);

    // Professional Studies questions are strictly for GTLE only
    if (isProfessionalStudiesSubject($db, $subjectId)) {
        $level = 'GTLE';
    }

    if ($level === 'GES-PROMO' && empty($rank)) {
        $rank = resolvePromotionRankId($subjectId);
    }

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
        'rank' => $rank ?: null,
        'createdAt' => round(microtime(true) * 1000)
    ];

    $db['questions'][] = $newQ;
    $saved = saveDb($db);
    if (!$saved) {
        errorOut('Server database write failed: Please ensure data folder has write permissions.', 500);
    }
    jsonOut($newQ, 201);
}

// Admin Update Question
if (preg_match('#^admin/questions/([^/]+)/update$#', $route, $m) && $method === 'POST') {
    $b = getJsonBody();
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $id = trim(urldecode($m[1]));

    $foundIdx = null;
    foreach ($db['questions'] as $i => $q) {
        if ((string)($q['id'] ?? '') === (string)$id) {
            $foundIdx = $i;
            break;
        }
    }
    if ($foundIdx === null) errorOut('Question not found', 404);

    $q = $db['questions'][$foundIdx];
    if (isset($b['subjectId'])) $q['subjectId'] = trim((string)$b['subjectId']);
    if (isset($b['level'])) {
        $lvl = normLevel($b['level']);
        if ($lvl !== null) {
            $q['level'] = $lvl;
        }
    }
    if (isProfessionalStudiesSubject($db, $q['subjectId'] ?? '')) {
        $q['level'] = 'GTLE';
    }
    if (isset($b['text'])) $q['text'] = trim((string)$b['text']);
    if (isset($b['options']) && is_array($b['options'])) $q['options'] = array_map('trim', $b['options']);
    if (isset($b['correctIndex'])) $q['correctIndex'] = (int)$b['correctIndex'];
    if (isset($b['explanation'])) $q['explanation'] = trim((string)$b['explanation']);
    if (isset($b['year'])) $q['year'] = trim((string)$b['year']);
    if (isset($b['category'])) $q['category'] = trim((string)$b['category']);
    if (isset($b['rank'])) $q['rank'] = trim((string)$b['rank']);
    if (($q['level'] ?? '') === 'GES-PROMO' && empty($q['rank'])) {
        $q['rank'] = resolvePromotionRankId($q['subjectId'] ?? '');
    }
    $q['updatedAt'] = round(microtime(true) * 1000);

    $db['questions'][$foundIdx] = $q;
    $saved = saveDb($db);
    if (!$saved) {
        errorOut('Server database write failed: Please ensure data/db.json has write permissions.', 500);
    }
    jsonOut(['ok' => true, 'question' => $q]);
}

// Admin Delete Question
if (preg_match('#^admin/questions/([^/]+)/delete$#', $route, $m) && $method === 'POST') {
    $b = getJsonBody();
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);
    $id = trim(urldecode($m[1]));
    $db['questions'] = array_values(array_filter($db['questions'], function($q) use ($id) {
        return (string)($q['id'] ?? '') !== (string)$id;
    }));
    $saved = saveDb($db);
    if (!$saved) {
        errorOut('Server database write failed: Please ensure data/db.json has write permissions.', 500);
    }
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
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

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

        // Professional Studies questions are strictly for GTLE only
        if (isProfessionalStudiesSubject($db, $targetSubjectId)) {
            $targetLevel = 'GTLE';
        }

        if (!$targetSubjectId || !$isValidSubjectOrRank($targetSubjectId)) {
            errorOut('Choose a valid subject or promotion rank before uploading.', 400);
        }
        if ($targetLevel === null) {
            errorOut('Choose a valid class level or exam section before uploading.', 400);
        }

        $rawOpts = is_array($item['options'] ?? null) ? $item['options'] : [];
        $cleanOpts = [];
        foreach ($rawOpts as $o) {
            $cleanOpts[] = trim((string)$o);
        }
        while (count($cleanOpts) < 4) {
            $cleanOpts[] = '';
        }
        $cleanOpts = array_slice($cleanOpts, 0, 4);

        $newQ = [
            'id' => generateUuid(),
            'subjectId' => $targetSubjectId,
            'level' => $targetLevel,
            'text' => trim((string)$item['text']),
            'options' => array_values($cleanOpts),
            'correctIndex' => max(0, min(3, (int)$item['correctIndex'])),
            'explanation' => trim((string)($item['explanation'] ?? '')),
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
            'adminRole' => isSuperAdminEmail($u['email'] ?? '') ? 'superadmin' : ($u['adminRole'] ?? ($u['role'] ?? null)),
            'isSuperAdmin' => isSuperAdminEmail($u['email'] ?? ''),
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

// Admin Roles: List All Admins & Editors
if ($route === 'admin/roles/list' && $method === 'POST') {
    $b = getJsonBody();
    if (!isAdmin($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $adminsList = [];
    $hasMarkInList = false;

    foreach ($db['users'] as $u) {
        $em = strtolower(trim((string)($u['email'] ?? '')));
        $isMark = isSuperAdminEmail($em);
        $role = $isMark ? 'superadmin' : (string)($u['adminRole'] ?? ($u['role'] ?? ''));

        if ($isMark) {
            $hasMarkInList = true;
            $adminsList[] = [
                'id' => $u['id'],
                'name' => $u['name'] ?: 'Mark Anibrika',
                'email' => $u['email'],
                'role' => 'superadmin',
                'isPrimarySuperAdmin' => true,
                'createdAt' => $u['createdAt'] ?? null,
                'promotionRank' => $u['promotionRank'] ?? ''
            ];
        } elseif (in_array($role, ['admin', 'editor', 'superadmin'], true)) {
            $adminsList[] = [
                'id' => $u['id'],
                'name' => $u['name'],
                'email' => $u['email'],
                'role' => $role,
                'isPrimarySuperAdmin' => false,
                'createdAt' => $u['createdAt'] ?? null,
                'promotionRank' => $u['promotionRank'] ?? ''
            ];
        }
    }

    if (!$hasMarkInList) {
        $adminsList[] = [
            'id' => '1eb911c4-ea55-4317-82a8-081a2c971668',
            'name' => 'Mark Anibrika',
            'email' => 'anibrikamark@gmail.com',
            'role' => 'superadmin',
            'isPrimarySuperAdmin' => true,
            'createdAt' => 1792321771016,
            'promotionRank' => 'Deputy Director (DD)'
        ];
    }

    jsonOut([
        'ok' => true,
        'admins' => $adminsList,
        'superAdminEmail' => 'anibrikamark@gmail.com'
    ]);
}

// Admin Roles: Promote / Demote Candidate
if ($route === 'admin/roles/promote' && $method === 'POST') {
    $b = getJsonBody();
    if (!isSuperAdmin($db, $b['passcode'] ?? null)) {
        errorOut('Only Super Admin (Mark Anibrika) can promote or demote quiz admins and editors.', 403);
    }

    $targetEmail = strtolower(trim((string)($b['targetEmail'] ?? '')));
    $targetUserId = trim((string)($b['targetUserId'] ?? ''));
    $newRole = strtolower(trim((string)($b['newRole'] ?? 'admin'))); // 'admin', 'editor', or 'candidate'

    if (!in_array($newRole, ['admin', 'editor', 'candidate'], true)) {
        errorOut('Role must be admin, editor, or candidate', 400);
    }

    if ($targetEmail === 'anibrikamark@gmail.com') {
        errorOut('Mark Anibrika is the primary Super Admin and cannot have his role altered.', 400);
    }

    $found = false;
    $affectedUser = null;
    foreach ($db['users'] as &$u) {
        $uEm = strtolower(trim((string)($u['email'] ?? '')));
        $uId = (string)($u['id'] ?? '');
        if (($targetUserId !== '' && $uId === $targetUserId) || ($targetEmail !== '' && $uEm === $targetEmail)) {
            if ($uEm === 'anibrikamark@gmail.com') {
                errorOut('Mark Anibrika is the primary Super Admin and cannot have his role altered.', 400);
            }
            $isTeacher = isTeacherRecord($u);
            if ($newRole === 'candidate') {
                $u['adminRole'] = null;
                if ($isTeacher) {
                    $u['role'] = 'teacher';
                    $u['accountType'] = 'teacher';
                    $u['isTeacher'] = true;
                } else {
                    $u['role'] = ($u['accountType'] ?? '') === 'ges-promo' ? 'ges-promo' : 'student';
                }
            } else {
                $u['adminRole'] = $newRole;
                if ($isTeacher) {
                    $u['role'] = 'teacher';
                    $u['accountType'] = 'teacher';
                    $u['isTeacher'] = true;
                } else {
                    $u['role'] = $newRole;
                }
            }
            $u['updatedAt'] = round(microtime(true) * 1000);
            $found = true;
            $affectedUser = $u;
            break;
        }
    }
    unset($u);

    if (!$found) {
        errorOut('User not found with provided ID or email', 404);
    }

    saveDb($db);
    jsonOut([
        'ok' => true,
        'user' => publicUser($affectedUser),
        'message' => ($newRole === 'candidate')
            ? "Removed admin privileges from {$affectedUser['name']}."
            : "Successfully assigned {$affectedUser['name']} as " . ($newRole === 'admin' ? 'Quiz Admin' : 'Quiz Editor') . "!"
    ]);
}

// Admin Roles: Create New Admin / Editor
if ($route === 'admin/roles/create' && $method === 'POST') {
    $b = getJsonBody();
    if (!isSuperAdmin($db, $b['passcode'] ?? null)) {
        errorOut('Only Super Admin (Mark Anibrika) can create new Admins or Editors.', 403);
    }

    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $role = strtolower(trim((string)($b['role'] ?? 'admin')));

    if ($name === '') errorOut('Full name is required', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) errorOut('Valid email address is required', 400);
    if (strlen($password) < 6) errorOut('Password must be at least 6 characters', 400);
    if (!in_array($role, ['admin', 'editor'], true)) errorOut('Role must be admin or editor', 400);

    foreach ($db['users'] as $u) {
        if (strtolower(trim((string)($u['email'] ?? ''))) === $email) {
            errorOut('An account with this email already exists. You can promote this existing user instead.', 409);
        }
    }

    $now = round(microtime(true) * 1000);
    $newUser = [
        'id' => generateUuid(),
        'name' => $name,
        'email' => $email,
        'role' => $role,
        'adminRole' => $role,
        'accountType' => 'admin',
        'schoolName' => 'Codecastic Administration',
        'gradeLevel' => 4,
        'passwordPlain' => $password,
        'passwordHash' => password_hash($password, PASSWORD_BCRYPT),
        'createdAt' => $now
    ];

    $db['users'][] = $newUser;
    saveDb($db);

    jsonOut([
        'ok' => true,
        'user' => publicUser($newUser),
        'message' => "Successfully created " . ($role === 'admin' ? 'Quiz Admin' : 'Quiz Editor') . " account for $name!"
    ], 201);
}

// Admin Roles: Revoke Privileges
if ($route === 'admin/roles/revoke' && $method === 'POST') {
    $b = getJsonBody();
    if (!isSuperAdmin($db, $b['passcode'] ?? null)) {
        errorOut('Only Super Admin (Mark Anibrika) can revoke admin roles.', 403);
    }

    $targetUserId = trim((string)($b['targetUserId'] ?? ''));
    $targetEmail = strtolower(trim((string)($b['targetEmail'] ?? '')));

    if ($targetEmail === 'anibrikamark@gmail.com') {
        errorOut('Mark Anibrika is the primary Super Admin and cannot be revoked.', 400);
    }

    $revoked = false;
    foreach ($db['users'] as &$u) {
        $uEm = strtolower(trim((string)($u['email'] ?? '')));
        $uId = (string)($u['id'] ?? '');
        if (($targetUserId !== '' && $uId === $targetUserId) || ($targetEmail !== '' && $uEm === $targetEmail)) {
            if ($uEm === 'anibrikamark@gmail.com') {
                errorOut('Mark Anibrika is the primary Super Admin and cannot be revoked.', 400);
            }
            $isTeacher = isTeacherRecord($u);
            $u['adminRole'] = null;
            if ($isTeacher) {
                $u['role'] = 'teacher';
                $u['accountType'] = 'teacher';
                $u['isTeacher'] = true;
            } else {
                $u['role'] = ($u['accountType'] ?? '') === 'ges-promo' ? 'ges-promo' : 'student';
            }
            $u['updatedAt'] = round(microtime(true) * 1000);
            $revoked = true;
            break;
        }
    }
    unset($u);

    if (!$revoked) errorOut('User not found', 404);

    saveDb($db);
    jsonOut(['ok' => true, 'message' => 'Admin privileges revoked successfully.']);
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
        'model' => 'gemini-1.5-flash'
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

function callGeminiApi($prompt, $apiKey, $model = 'gemini-1.5-flash') {
    if (empty($apiKey)) return null;

    $modelMap = [
        'gemini-3.5-flash-lite' => 'gemini-1.5-flash',
        'gemini-3.5-flash' => 'gemini-1.5-flash',
        'gemini-3.8-flash' => 'gemini-1.5-pro',
        'gemini-2.5-flash' => 'gemini-2.0-flash',
        'gemini-2.0-flash-exp' => 'gemini-2.0-flash',
        'gemini-2.0-flash-lite' => 'gemini-2.0-flash-lite'
    ];
    $cleanModel = trim((string)$model);
    if (isset($modelMap[$cleanModel])) {
        $cleanModel = $modelMap[$cleanModel];
    }
    if (empty($cleanModel)) {
        $cleanModel = 'gemini-1.5-flash';
    }

    $candidateModels = array_unique([$cleanModel, 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro']);

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
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);

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
                'timeout' => 15,
                'ignore_errors' => true
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false
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
            errorOut('Could not verify Gemini API Key with Google. Please ensure you copied a valid API key from Google AI Studio (starts with AIzaSy... or AQ...) and that your hosting allows outgoing HTTPS requests.', 400);
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

// Helper to infer or resolve subject name from context
function resolveSubjectContext($db, $subjectId, $subjectName, $level, $text, $explanation) {
    $subj = trim((string)$subjectName);
    if ($subj !== '' && strcasecmp($subj, 'General Studies') !== 0 && strcasecmp($subj, 'General') !== 0) {
        return $subj;
    }
    if (!empty($subjectId) && !empty($db['subjects']) && is_array($db['subjects'])) {
        foreach ($db['subjects'] as $s) {
            if ((string)($s['id'] ?? '') === (string)$subjectId) {
                return (string)($s['name'] ?? $subj);
            }
        }
    }
    if (strtoupper((string)$level) === 'GES-PROMO') {
        return 'GES Educational Administration & School Management';
    }
    $ctx = strtolower($text . ' ' . $explanation);
    if (preg_match('/aquatic|pond|habitat|fish|water|organism|plant|cell|tissue|photosynthesis|respiration|science|biology|chemistry|acid|base|physics|force|energy|magnet/i', $ctx)) {
        return 'Integrated Science';
    }
    if (preg_match('/comput|ict|hardware|software|cpu|memory|network|internet|ram|rom|operating system|program|digital|cyber/i', $ctx)) {
        return 'Computing';
    }
    if (preg_match('/fraction|algebra|equation|triangle|angle|polygon|ratio|percentage|probability|arithmetic|geometry/i', $ctx)) {
        return 'Mathematics';
    }
    if (preg_match('/constitution|governance|parliament|culture|festival|heritage|chieftaincy|democracy|civic|environment/i', $ctx)) {
        return 'Social Studies';
    }
    if (preg_match('/grammar|noun|verb|tense|adverb|preposition|clause|phrase|idiom|metaphor|sentence|concord/i', $ctx)) {
        return 'English Language';
    }
    return $subj !== '' ? $subj : 'Integrated Science';
}

// Generate intelligent, syllabus-grounded, domain-specific distractors (never out-of-context words)
function generateContextualDistractor($subjectName, $level, $text, $explanation, $existingOptions = []) {
    $ctx = strtolower($subjectName . ' ' . $level . ' ' . $text . ' ' . $explanation);
    $existingLower = array_map(function($o) { return strtolower(trim($o)); }, $existingOptions);
    $candidates = [];

    // 1. Science: Aquatic, Ecosystem, Habitat, Biology, Living Things
    if (preg_match('/aquatic|pond|habitat|fish|water|ecosystem|lake|river|marine|species|organism|adaptation|predator|prey|food chain|food web|dehydration|stability/i', $ctx)) {
        $candidates = [
            'Aquatic organisms dehydrate quickly due to high rates of evaporative water loss',
            'Dissolved oxygen levels drop sharply as ambient water volume decreases',
            'Organisms experience rapid temperature fluctuations compared to stable water environments',
            'Evaporative concentration of mineral salts exceeds the physiological tolerance of species',
            'Aquatic plants lose physical buoyancy and collapse without hydrostatic support',
            'Organisms burrow into moist sub-surface mud to prevent lethal desiccation',
            'Predatory pressure intensifies as shrinking water volume concentrates remaining species',
            'Decomposition rates decline as aerobic aquatic bacteria run out of dissolved oxygen'
        ];
    }
    // 2. Science: Cells, Genetics, Tissues, Photosynthesis, Respiration
    elseif (preg_match('/cell|tissue|organ|mitochondri|nucleus|membrane|chloroplast|photosynthesis|respiration|enzyme|digest|blood|circulat/i', $ctx)) {
        $candidates = [
            'The selectively permeable membrane regulates ion movement across the boundary',
            'Mitochondria generate adenosine triphosphate (ATP) via aerobic cellular respiration',
            'Cytoplasm provides the aqueous medium necessary for enzyme-catalyzed reactions',
            'The cell nucleus preserves, regulates, and transcribes genetic information',
            'Ribosomes translate messenger RNA into structured polypeptide sequences',
            'Chloroplasts capture solar photons to synthesize simple hexose carbohydrates'
        ];
    }
    // 3. Science: Chemistry, Acids, Bases, Matter, Atoms, Elements
    elseif (preg_match('/acid|base|neutral|ph|salt|element|compound|mixture|atom|electron|bond|chemical|react|solut/i', $ctx)) {
        $candidates = [
            'Neutral aqueous solutions maintain a pH value of exactly 7.0 at 25 degrees Celsius',
            'Bases react with acids in neutralization reactions to yield a neutral salt and water',
            'Valence electrons are shared between adjacent non-metal atoms in covalent bonds',
            'Oxidation involves the loss of electrons or an increase in atomic oxidation state',
            'Solute solubility decreases progressively as temperature drops in saturated solutions',
            'Indicators undergo reversible molecular shifts in response to hydrogen ion concentration'
        ];
    }
    // 4. Science: Physics, Energy, Force, Motion, Light, Electricity
    elseif (preg_match('/force|energy|motion|speed|gravity|friction|heat|temperature|convect|conduct|electric|circuit|magnet|refract|reflect|wave/i', $ctx)) {
        $candidates = [
            'Kinetic energy increases proportionally with the square of the body\'s velocity',
            'Gravitational potential energy depends directly on mass, acceleration of gravity, and vertical height',
            'Convection currents transfer thermal energy through density differentials in fluids',
            'Electrical resistance opposes the flow of electric charge through the conductive medium',
            'Light rays bend toward the normal when entering an optically denser medium',
            'Magnetic field lines emerge from the north pole and curve into the south pole'
        ];
    }
    // 5. Computing / ICT: Hardware, Architecture, Processing, Memory
    elseif (preg_match('/computer|comput|hardware|cpu|processor|circuit|memory|ram|rom|storage|register|cache|bus|generation|transistor|microprocessor/i', $ctx)) {
        $candidates = [
            'Internal registers provide ultra-fast temporary storage inside the central processor',
            'Cache memory bridges the processing speed disparity between the CPU and system RAM',
            'Read-Only Memory (ROM) retains non-volatile boot sequence instructions permanently',
            'The control unit orchestrates instruction decoding and synchronous data bus traffic',
            'Solid-state drives employ flash memory cells for fast non-volatile secondary storage',
            'The arithmetic logic unit executes all fundamental binary operations and comparisons'
        ];
    }
    // 6. Computing / ICT: Software, Networks, Internet, Cybersecurity
    elseif (preg_match('/software|network|internet|web|protocol|ip|dns|operating system|program|malware|firewall|virus|cyber/i', $ctx)) {
        $candidates = [
            'System software manages computer hardware and provides platform services for apps',
            'Utility software handles data compression, disk defragmentation, and system diagnostics',
            'Network protocols establish standardized rules for packet formatting and data routing',
            'Device drivers translate high-level operating system requests into hardware instructions',
            'Encryption algorithms protect sensitive data payloads during network transmission',
            'The Domain Name System (DNS) resolves human-readable domain names into numeric IP addresses'
        ];
    }
    // 7. Mathematics: Numbers, Geometry, Algebra, Statistics
    elseif (preg_match('/math|arithmetic|fraction|algebra|equation|triangle|angle|polygon|circle|radius|ratio|percent|probability|mean|median/i', $ctx)) {
        $candidates = [
            'The interior angles of any planar triangle sum to exactly 180 degrees',
            'The value varies inversely proportional to the square of the corresponding parameter',
            'The prime factorization contains exclusively odd prime numbers',
            'The constant rate of change maintains linearity across the entire coordinate plane',
            'The reciprocal transformation reverses the numerator and denominator values',
            'The cumulative probability of all mutually exclusive outcomes equals 1'
        ];
    }
    // 8. Social Studies / Citizenship / Governance / History
    elseif (preg_match('/social|citizen|governance|constitution|parliament|culture|festival|heritage|chieftaincy|democracy|ghana|environment|resource/i', $ctx)) {
        $candidates = [
            'Fostering civic participation and responsible community development initiatives',
            'Preserving cultural heritage through traditional festivals and customary institutions',
            'Enforcing constitutional checks and balances among the three arms of government',
            'Promoting sustainable resource management and environmental conservation practices',
            'Upholding the rule of law and protecting fundamental human rights for all citizens'
        ];
    }
    // 9. English Language / Grammar / Literature
    elseif (preg_match('/english|grammar|noun|verb|tense|adverb|preposition|clause|phrase|idiom|metaphor|simile|concord|voice/i', $ctx)) {
        $candidates = [
            'A subordinate clause functioning as an adverbial modifier of condition',
            'Passive voice construction emphasizing the action rather than the doer',
            'Figurative metaphor expressing an implicit comparison between two entities',
            'Subject-verb agreement requiring plural concord with compound subjects',
            'An idiomatic expression conveying caution in decision-making'
        ];
    }
    // 10. GES Promotion / Educational Leadership (ONLY for GES-PROMO)
    elseif (strtoupper((string)$level) === 'GES-PROMO' || preg_match('/ges|promo|deputy director|assistant director|principal superintendent|headteacher|supervision|nacca|ntc|nasia|act 1023|code of conduct|cssps/i', $ctx)) {
        $candidates = [
            'School Management Committee (SMC) overseeing community partnership and school property',
            'Ghana Education Service Council (GESC) formulating pre-tertiary policies under Act 1023',
            'National Council for Curriculum and Assessment (NaCCA) developing standard-based frameworks',
            'National Teaching Council (NTC) regulating teacher licensing and continuous professional development',
            'Parent-Teacher Association (PTA) mobilizing welfare support and community participation',
            'National Schools Inspectorate Authority (NaSIA) enforcing institutional quality standards'
        ];
    }
    // General fallback
    else {
        $candidates = [
            'Functional component providing structural stability and operational balance',
            'Standardized benchmark evaluated according to national curriculum guidelines',
            'Systemic process maintaining equilibrium within the defined parameters',
            'Primary mechanism governing the observed change in condition',
            'Complementary element contributing to overall system performance'
        ];
    }

    foreach ($candidates as $cand) {
        if (!in_array(strtolower(trim($cand)), $existingLower)) {
            return $cand;
        }
    }

    return $candidates[0] ?? 'Curriculum-aligned alternative distractor';
}

// Generate in-depth, well-researched, option-by-option educational candidate breakdown
function generateCandidateTutorExplanation($subjectName, $level, $text, $options, $correctIndex, $studentChosen, $explanation, $studentQuestion) {
    $letters = ['A', 'B', 'C', 'D'];
    $correctLetter = $letters[$correctIndex] ?? 'A';
    $correctText = $options[$correctIndex] ?? '';
    $studentChosenLetter = ($studentChosen !== null && isset($letters[$studentChosen])) ? $letters[$studentChosen] : null;
    $studentChosenText = ($studentChosen !== null && isset($options[$studentChosen])) ? $options[$studentChosen] : null;

    $out = "Akwaaba, scholar! Here is your comprehensive Ghanaian curriculum exam breakdown for this question:\n\n";

    // 1. Direct Verdict
    $out .= "### 🎯 Correct Answer: Option {$correctLetter} — \"{$correctText}\"\n\n";

    // 2. In-Depth Curriculum Concept Explanation
    $out .= "### 🔬 In-Depth Academic Explanation\n";
    if (!empty($explanation)) {
        $out .= $explanation . "\n\n";
    } else {
        $out .= "In the Ghanaian {$subjectName} syllabus ({$level}), this question assesses your conceptual understanding of foundational curriculum principles. Option {$correctLetter} provides the accurate, syllabus-defined fact that satisfies all criteria established by examiners.\n\n";
    }

    // 3. Option-by-Option Breakdown
    $out .= "### 🔍 Systematic Option-by-Option Analysis\n";
    foreach ($options as $i => $opt) {
        $let = $letters[$i] ?? chr(65 + $i);
        $trimmedOpt = trim($opt);
        if ($i === $correctIndex) {
            $out .= "• **Option {$let} (\"{$trimmedOpt}\") — [CORRECT ANSWER]:**\n";
            $out .= "  This is the precise, syllabus-aligned statement. It accurately captures the principle tested and directly answers the question prompt.\n\n";
        } else {
            $out .= "• **Option {$let} (\"{$trimmedOpt}\") — [INCORRECT DISTRACTOR]:**\n";
            $out .= "  This option is false or misleading. In Ghanaian examinations, examiners craft this distractor to test whether candidates confuse related terms or overlook key qualifying words in the question stem.\n\n";
        }
    }

    // 4. Candidate Diagnostic Feedback
    if ($studentChosen !== null) {
        $out .= "### 📊 Diagnostic Feedback on Your Answer\n";
        if ($studentChosen === $correctIndex) {
            $out .= "🌟 **Ayekoo! Excellent Work:** You correctly selected Option {$correctLetter}. You have demonstrated genuine mastery of this concept and answered exactly as required by WAEC/GES examiners.\n\n";
        } else {
            $out .= "⚠️ **Reviewing Your Choice (Option {$studentChosenLetter}):** You chose Option {$studentChosenLetter} (\"{$studentChosenText}\"). While this may seem plausible at first glance, it is an intentional distractor. Review the option-by-option breakdown above to spot the trap and master the syllabus standard!\n\n";
        }
    }

    // 5. WAEC / Examiner Insights
    $out .= "### 💡 Ghanaian Examiner Tips & Exam Strategy\n";
    $ctx = strtolower($subjectName . ' ' . $text);
    if (preg_match('/science|bio|chem|phys|aquatic|habitat|cell/i', $ctx)) {
        $out .= "• In Ghanaian Science examinations (NaCCA/WAEC), examiners award top marks for identifying precise biological relationships, environmental adaptations, and cause-and-effect balances.\n";
        $out .= "• Always read the scenario carefully and identify whether the question is asking for an advantage, a disadvantage, an adaptation, or an impact.\n\n";
    } elseif (preg_match('/comput|ict|hardware|software|network/i', $ctx)) {
        $out .= "• In Computing/ICT papers, WAEC examiners test specific technical terminology and hardware generations. Beware of confusing storage capacity with processing speed.\n";
        $out .= "• Pay special attention to acronyms and component functions (e.g. CPU control unit vs ALU vs RAM).\n\n";
    } elseif (preg_match('/math|fraction|algebra|geometry/i', $ctx)) {
        $out .= "• In Mathematics, double check your intermediate working and verify signs (+/-). Eliminating extreme or mathematically impossible options first saves critical exam time.\n\n";
    } elseif (preg_match('/social|governance|history|culture/i', $ctx)) {
        $out .= "• In Social Studies, examiners look for balanced understanding of civic rights, constitutional duties, and sustainable environmental practices.\n\n";
    } else {
        $out .= "• In Ghanaian national examinations, careful reading of the question stem is key. Identify the operative action words before selecting your final answer.\n\n";
    }

    // 6. Domesticated Ghanaian Analogy / Motivation
    $out .= "### 🇬🇭 Everyday Ghanaian Context & Memory Aid\n";
    if (preg_match('/aquatic|pond|habitat|fish|water/i', $ctx)) {
        $out .= "Think of traditional fish ponds along the Volta Basin or coastal lagoons in Ada and Keta: when seasonal rains cease and water levels drop, the sudden change in temperature and oxygen makes survival difficult for organisms adapted to stable aquatic conditions. Remembering this real-life Ghanaian environment helps you quickly recall why water stability is such a vital habitat advantage!\n\n";
    } elseif (preg_match('/cell|living|biology/i', $ctx)) {
        $out .= "Just like the walls of a secure compound house in a Ghanaian town protect everything inside while allowing members to enter and leave, living cell membranes selectively control what enters and leaves the cell.\n\n";
    } else {
        $out .= "Connecting your textbook concepts to familiar Ghanaian surroundings—from our vibrant markets to our geography—turns abstract ideas into permanent exam success.\n\n";
    }

    $out .= "Keep studying and practicing with dedication—you are on the path to academic distinction!";
    return $out;
}

// AI Question Audit & Auto-Resolution (POST)
if ($route === 'ai/audit-question' && $method === 'POST') {
    $b = getJsonBody();
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $q = is_array($b['question'] ?? null) ? $b['question'] : [];
    $text = trim((string)($q['text'] ?? ''));
    $options = is_array($q['options'] ?? null) ? array_map('trim', $q['options']) : [];
    $correctIndex = (int)($q['correctIndex'] ?? 0);
    $explanation = trim((string)($q['explanation'] ?? ''));
    $level = (string)($q['level'] ?? ($b['level'] ?? ''));
    $subjectId = (string)($q['subjectId'] ?? ($b['subjectId'] ?? ''));
    $subjectName = resolveSubjectContext($db, $subjectId, $b['subjectName'] ?? ($q['subjectName'] ?? ''), $level, $text, $explanation);

    if ($text === '' || count($options) !== 4) {
        errorOut('Invalid question data provided for audit.', 400);
    }

    // 1. Detect duplicates locally first
    $cleanedOpts = array_map(function($o) { return trim(strtolower($o)); }, $options);
    $counts = array_count_values($cleanedOpts);
    $dupes = [];
    foreach ($counts as $val => $c) {
        if ($c > 1 && $val !== '') $dupes[$val] = true;
    }
    $hasLocalDuplicates = !empty($dupes);

    // 2. Query Gemini AI for educational audit and fix recommendation
    $ai = getAiSettings($db);
    $aiResponse = null;

    if (!empty($ai['apiKey']) && $ai['enabled']) {
        $aiPrompt = "You are an elite curriculum specialist and chief examination auditor for the Ghanaian pre-tertiary and teacher examination system (NaCCA standards for Basic 4-9/BECE, WAEC standards for WASSCE, and NTC/GES Promotion standards).

AUDIT TARGET:
- Subject: {$subjectName}
- Grade Level: {$level}
- Question Text: {$text}
- Option A: {$options[0]}
- Option B: {$options[1]}
- Option C: {$options[2]}
- Option D: {$options[3]}
- Currently Marked Correct: Option " . chr(65 + $correctIndex) . " ({$options[$correctIndex]})
- Current Explanation: {$explanation}

CRITICAL RULES & AUDIT REQUIREMENTS:
1. SUBJECT INTEGRITY & DOMAIN RELEVANCE (TOP PRIORITY):
   - Every single option MUST be strictly relevant to the subject '{$subjectName}' and the specific concept tested in this question.
   - Absolutely NEVER introduce terms from unrelated subjects (for example, NEVER suggest administrative committees, school management, or computer components for a Science or Mathematics question).
2. DISTRACTOR QUALITY & REALISM:
   - All 4 options must be plausible, academically sound, distinct distractors that represent realistic answers or common student misconceptions within '{$subjectName}'.
   - NEVER use 'None of the above', 'All of the above', or non-answers.
   - If options are duplicates, poorly phrased, or missing, replace the duplicate/flawed option with a well-researched, realistic alternative choice that matches the grammatical structure and difficulty of the other options.
3. ACCURATE ANSWER KEY & EXPLANATION:
   - Determine which option is factually, scientifically, and curriculum-wise the true correct answer.
   - If the currently marked correct option is already factually correct, KEEP it as the correct answer and preserve its position unless repairing duplicates.
   - Set 'correctIndex' to the 0-based index of the true correct answer (0 for A, 1 for B, 2 for C, 3 for D).
   - In 'explanation', provide an authoritative, curriculum-grounded explanation explaining why the correct option is right.

Respond strictly in valid JSON format:
{
  \"hasIssue\": true,
  \"issueSummary\": \"Detailed explanation of detected duplicate or flaw and what was repaired.\",
  \"correctedOptions\": [\"Option A\", \"Option B\", \"Option C\", \"Option D\"],
  \"correctIndex\": 0,
  \"explanation\": \"Authoritative curriculum explanation confirming the correct answer.\"
}";

        $rawAi = callGeminiApi($aiPrompt, $ai['apiKey'], $ai['model']);
        if ($rawAi) {
            $cleaned = preg_replace('/^```(?:json)?\s*/i', '', trim($rawAi));
            $cleaned = preg_replace('/\s*```$/', '', $cleaned);
            $parsed = json_decode($cleaned, true);
            if (is_array($parsed) && isset($parsed['correctedOptions']) && count($parsed['correctedOptions']) === 4) {
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
            $fixedOpts = $options;
            $newDistractor = generateContextualDistractor($subjectName, $level, $text, $explanation, $options);
            
            // Find duplicate occurrence and safely replace without overwriting correct answer
            $seenOccurrences = [];
            $targetCorrectIndex = $correctIndex;
            foreach ($fixedOpts as $idx => $opt) {
                $low = trim(strtolower($opt));
                if (isset($seenOccurrences[$low])) {
                    // This is a duplicate. If this duplicate slot happened to be marked as correct,
                    // transfer correctIndex to the first occurrence that keeps the original correct text!
                    if ($idx === $targetCorrectIndex) {
                        $targetCorrectIndex = $seenOccurrences[$low];
                    }
                    $fixedOpts[$idx] = $newDistractor;
                    break;
                }
                $seenOccurrences[$low] = $idx;
            }

            $aiResponse = [
                'hasIssue' => true,
                'issueSummary' => "Duplicate options detected (\"{$duplicateText}\"). Replaced duplicate with a curriculum-aligned, subject-appropriate distractor for {$subjectName}.",
                'correctedOptions' => $fixedOpts,
                'correctIndex' => $targetCorrectIndex,
                'explanation' => $explanation ?: "Fixed duplicate options to ensure 4 distinct, curriculum-aligned choices for {$subjectName}."
            ];
        } else {
            $aiResponse = [
                'hasIssue' => false,
                'issueSummary' => "No duplicate options detected. All 4 choices are distinct.",
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
    if (!isEditor($db, $b['passcode'] ?? null)) errorOut('Not authorised', 401);

    $id = trim((string)($b['questionId'] ?? ''));
    $fixed = is_array($b['fixed'] ?? null) ? $b['fixed'] : [];
    if (!$id || empty($fixed['options']) || count($fixed['options']) !== 4) {
        errorOut('Invalid question fix payload.', 400);
    }

    $foundIdx = null;
    foreach ($db['questions'] as $i => $q) {
        if ((string)($q['id'] ?? '') === (string)$id) {
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
    $saved = saveDb($db);
    if (!$saved) {
        errorOut('Server database write failed: Please ensure data/db.json has write permissions.', 500);
    }

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
    $subjectId = (string)($q['subjectId'] ?? ($b['subjectId'] ?? ''));
    $subjectName = resolveSubjectContext($db, $subjectId, $b['subjectName'] ?? ($q['subjectName'] ?? 'General Studies'), $level, $text, $explanation);

    if ($text === '') errorOut('Question text is required for AI clarification.', 400);

    $correctLetter = chr(65 + $correctIndex);
    $correctText = $options[$correctIndex] ?? 'Correct Option';
    $studentChosenText = ($studentChosen !== null && isset($options[$studentChosen]))
        ? chr(65 + $studentChosen) . ") " . $options[$studentChosen]
        : "Unanswered";

    $ai = getAiSettings($db);
    $reply = '';

    if (!empty($ai['apiKey']) && $ai['enabled']) {
        $prompt = "You are the Codecastic Master AI Tutor, an exceptional Ghanaian master educator (National Best Teacher standard) and curriculum authority for the Ghanaian pre-tertiary and teacher examination system (NaCCA standards for Basic 4-9/BECE, WAEC standards for WASSCE, and NTC/GES Promotion standards).

EXAM & QUESTION DETAILS:
- Subject: {$subjectName}
- Grade / Exam Level: {$level}
- Question: {$text}
- Option A: {$options[0]}
- Option B: {$options[1]}
- Option C: {$options[2]}
- Option D: {$options[3]}
- Marked Correct Answer: Option {$correctLetter} ({$correctText})
- Candidate's Selected Option: {$studentChosenText}
- Official Explanation: {$explanation}
- Candidate's Question / Prompt: \"{$studentQuestion}\"

MANDATORY PEDAGOGICAL & RESEARCH REQUIREMENTS:
1. DEEP ACADEMIC RESEARCH & RIGOUR:
   - Provide an authoritative, in-depth explanation of the academic concept behind this question. Do NOT provide shallow, brief, or generic summaries.
2. OPTION-BY-OPTION DETAILED ANALYSIS (MANDATORY):
   - You MUST systematically analyze ALL 4 OPTIONS (A, B, C, and D) individually:
     * Explain why Option {$correctLetter} is factually and scientifically the correct answer according to the Ghanaian curriculum.
     * For EACH incorrect option, explain specifically why it is false, what misconception it represents, and why it is an invalid distractor.
     * If the candidate chose an incorrect option ({$studentChosenText}), specifically explain their exact mistake and how to avoid that specific trap.
3. GHANAIAN EXAMINER INSIGHTS:
   - Provide specific WAEC / NaCCA / GES Chief Examiner insights on this topic (key keywords, common candidate pitfalls, definitions).
4. DOMESTICATED GHANAIAN REAL-WORLD ANALOGY & MNEMONIC:
   - Connect the concept to everyday Ghanaian life, environment, or geography (e.g. Lake Volta, Akosombo, local foods, traditional practices) to help the candidate remember it forever.
   - Absolutely NO foreign/Western pop-culture references.
5. FORMATTING:
   - Use structured markdown with clear headings:
     ### 🎯 Correct Answer & Core Concept
     ### 🔬 Academic Explanation
     ### 🔍 Option-by-Option Breakdown
     ### 📊 Diagnostic on Candidate's Choice
     ### 💡 Ghanaian Examiner Tips
     ### 🇬🇭 Ghanaian Memory Hook
   - End with warm, authentic Ghanaian encouragement.";

        $aiReply = callGeminiApi($prompt, $ai['apiKey'], $ai['model']);
        if ($aiReply) $reply = $aiReply;
    }

    // In-depth educational synthesis if Gemini key is not entered or API unavailable
    if (!$reply) {
        $reply = generateCandidateTutorExplanation($subjectName, $level, $text, $options, $correctIndex, $studentChosen, $explanation, $studentQuestion);
    }

    jsonOut([
        'ok' => true,
        'reply' => $reply
    ]);
}

// -------------------------------------------------------------
// School & Teacher Portal Endpoints
// -------------------------------------------------------------

// List all active schools (Public: used for student sign-up dropdown)
if ($route === 'schools/list' && ($method === 'GET' || $method === 'POST')) {
    $schools = [];
    if (!empty($db['schools']) && is_array($db['schools'])) {
        foreach ($db['schools'] as $s) {
            $schools[] = [
                'id' => (string)($s['id'] ?? ''),
                'name' => (string)($s['name'] ?? ''),
                'code' => (string)($s['code'] ?? ''),
                'region' => (string)($s['region'] ?? ''),
                'town' => (string)($s['town'] ?? ''),
                'category' => (string)($s['category'] ?? 'Combined')
            ];
        }
    }
    usort($schools, function($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });
    jsonOut(['schools' => $schools]);
}

// School Registration (creates School and School Admin account)
if ($route === 'school/register' && $method === 'POST') {
    $b = getJsonBody();
    $name = trim((string)($b['schoolName'] ?? ''));
    $code = strtoupper(trim((string)($b['schoolCode'] ?? '')));
    $region = trim((string)($b['region'] ?? ''));
    $town = trim((string)($b['town'] ?? ''));
    $category = trim((string)($b['category'] ?? 'Combined'));
    $adminName = trim((string)($b['adminName'] ?? 'Head of School'));
    $email = strtolower(trim((string)($b['adminEmail'] ?? '')));
    $password = (string)($b['adminPassword'] ?? '');

    if ($name === '') errorOut('School name is required', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) errorOut('Enter a valid administrator email address', 400);
    if (strlen($password) < 6) errorOut('Password must be at least 6 characters', 400);

    // Auto-generate school code if empty
    if ($code === '') {
        $clean = preg_replace('/[^A-Za-z0-9]/', '', $name);
        $prefix = strtoupper(substr($clean, 0, 4));
        if (strlen($prefix) < 3) $prefix = 'SCH';
        $code = $prefix . '-' . rand(100, 999);
    }

    // Ensure school code is unique
    if (!empty($db['schools'])) {
        foreach ($db['schools'] as $es) {
            if (strcasecmp((string)($es['code'] ?? ''), $code) === 0) {
                $code .= '-' . rand(10, 99);
                break;
            }
        }
    }

    // Ensure admin email does not already exist
    foreach ($db['users'] as $u) {
        if (strtolower(trim((string)($u['email'] ?? ''))) === $email) {
            errorOut('An account with this administrator email already exists. Please sign in.', 409);
        }
    }

    $schoolId = generateUuid();
    $now = round(microtime(true) * 1000);
    $schoolRecord = [
        'id' => $schoolId,
        'name' => $name,
        'code' => $code,
        'region' => $region,
        'town' => $town,
        'category' => $category,
        'adminEmail' => $email,
        'createdAt' => $now
    ];
    $db['schools'][] = $schoolRecord;

    $adminId = generateUuid();
    $token = bin2hex(random_bytes(24));
    $userRecord = [
        'id' => $adminId,
        'name' => $adminName,
        'email' => $email,
        'role' => 'school_admin',
        'accountType' => 'school_admin',
        'schoolId' => $schoolId,
        'schoolName' => $name,
        'schoolCode' => $code,
        'gradeLevel' => 8,
        'passwordPlain' => $password,
        'passwordHash' => password_hash($password, PASSWORD_BCRYPT),
        'createdAt' => $now
    ];
    $db['users'][] = $userRecord;
    $db['sessions'][] = [
        'id' => generateUuid(),
        'userId' => $adminId,
        'token' => $token,
        'createdAt' => $now
    ];

    saveDb($db);

    jsonOut([
        'ok' => true,
        'token' => $token,
        'school' => $schoolRecord,
        'user' => publicUser($userRecord)
    ], 201);
}

// School & Teacher Login
if ($route === 'school/login' && $method === 'POST') {
    $b = getJsonBody();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');

    if ($email === '') errorOut('Email is required', 400);
    if ($password === '') errorOut('Password is required', 400);

    $matchedUser = null;
    foreach ($db['users'] as $u) {
        if (strtolower(trim((string)($u['email'] ?? ''))) === $email) {
            $matchedUser = $u;
            break;
        }
    }

    if (!$matchedUser) {
        errorOut('No account found with this email. Please check your credentials.', 401);
    }

    $valid = false;
    if (!empty($matchedUser['passwordHash']) && password_verify($password, $matchedUser['passwordHash'])) {
        $valid = true;
    } elseif (isset($matchedUser['passwordPlain']) && $matchedUser['passwordPlain'] === $password) {
        $valid = true;
    }

    if (!$valid) {
        errorOut('Incorrect password. Please try again.', 401);
    }

    $role = (string)($matchedUser['role'] ?? '');
    $isTeacher = isTeacherRecord($matchedUser);
    $isSchoolAdmin = isSchoolAdminRecord($matchedUser);
    $isPrivileged = in_array($role, ['school_admin', 'teacher', 'admin', 'superadmin', 'editor'], true)
        || !empty($matchedUser['adminRole'])
        || $isTeacher
        || $isSchoolAdmin;

    if (!$isPrivileged) {
        errorOut('This account is registered as a regular student. Please sign in via the Student Portal.', 403);
    }

    $school = null;
    $sId = (string)($matchedUser['schoolId'] ?? '');
    if ($sId !== '' && !empty($db['schools'])) {
        foreach ($db['schools'] as $s) {
            if (($s['id'] ?? '') === $sId) {
                $school = $s;
                break;
            }
        }
    }

    $token = bin2hex(random_bytes(24));
    $now = round(microtime(true) * 1000);
    $db['sessions'][] = [
        'id' => generateUuid(),
        'userId' => $matchedUser['id'],
        'token' => $token,
        'createdAt' => $now
    ];
    saveDb($db);

    jsonOut([
        'ok' => true,
        'token' => $token,
        'user' => publicUser($matchedUser),
        'school' => $school
    ]);
}

// Mount Teacher (POST /api/school/teachers/add)
if ($route === 'school/teachers/add' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (($u['role'] ?? '') !== 'school_admin' && ($u['role'] ?? '') !== 'admin')) {
        errorOut('Not authorised. School Administrator privileges required.', 403);
    }

    $schoolId = (string)($u['schoolId'] ?? ($b['schoolId'] ?? ''));
    $schoolName = (string)($u['schoolName'] ?? '');
    $schoolCode = (string)($u['schoolCode'] ?? '');

    $name = trim((string)($b['name'] ?? ''));
    $gender = trim((string)($b['gender'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = trim((string)($b['password'] ?? ''));
    if ($password === '') $password = 'Teacher2026#';
    $assignedSubjects = is_array($b['assignedSubjects'] ?? null) ? $b['assignedSubjects'] : [];
    $assignedLevels = is_array($b['assignedLevels'] ?? null) ? $b['assignedLevels'] : [];
    $classSections = is_array($b['classSections'] ?? null) ? $b['classSections'] : [];

    if ($name === '') errorOut('Teacher full name is required', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) errorOut('Enter a valid teacher email address', 400);

    foreach ($db['users'] as $eu) {
        if (strtolower(trim((string)($eu['email'] ?? ''))) === $email) {
            errorOut('An account with this email already exists in the system.', 409);
        }
    }

    $teacherId = generateUuid();
    $now = round(microtime(true) * 1000);
    $teacherRecord = [
        'id' => $teacherId,
        'name' => $name,
        'gender' => $gender,
        'email' => $email,
        'role' => 'teacher',
        'accountType' => 'teacher',
        'schoolId' => $schoolId,
        'schoolName' => $schoolName,
        'schoolCode' => $schoolCode,
        'gradeLevel' => 'TEACHER',
        'assignedSubjects' => $assignedSubjects,
        'assignedLevels' => $assignedLevels,
        'classSections' => $classSections,
        'passwordPlain' => $password,
        'passwordHash' => password_hash($password, PASSWORD_BCRYPT),
        'createdAt' => $now
    ];

    $db['users'][] = $teacherRecord;
    saveDb($db);

    jsonOut([
        'ok' => true,
        'teacher' => publicUser($teacherRecord)
    ], 201);
}

// List Teachers (GET or POST /api/school/teachers)
if ($route === 'school/teachers' && ($method === 'GET' || $method === 'POST')) {
    $b = getJsonBody();
    $token = $b['token'] ?? ($_GET['token'] ?? null);
    $u = getUserByToken($db, $token);
    if (!$u) errorOut('Not authorised', 401);

    $schoolId = (string)($u['schoolId'] ?? ($b['schoolId'] ?? ($_GET['schoolId'] ?? '')));
    $schoolCode = (string)($u['schoolCode'] ?? ($b['schoolCode'] ?? ($_GET['schoolCode'] ?? '')));
    $schoolName = (string)($u['schoolName'] ?? ($b['schoolName'] ?? ($_GET['schoolName'] ?? '')));
    if ($schoolId === '' && $schoolCode === '' && $schoolName === '') errorOut('School ID required', 400);

    $teachers = [];
    foreach ($db['users'] as $usr) {
        if (matchesSchool($usr, $schoolId, $schoolCode, $schoolName) && isTeacherRecord($usr)) {
            $teachers[] = publicUser($usr);
        }
    }

    usort($teachers, function($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });

    jsonOut(['teachers' => $teachers]);
}

// Delete Teacher (POST /api/school/teachers/delete)
if ($route === 'school/teachers/delete' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (!isSchoolAdminRecord($u) && !isAdmin($db, $b['token'] ?? null))) {
        errorOut('Not authorised', 403);
    }
    $schoolId = (string)($u['schoolId'] ?? '');
    $schoolCode = (string)($u['schoolCode'] ?? '');
    $schoolName = (string)($u['schoolName'] ?? '');
    $teacherId = trim((string)($b['teacherId'] ?? ''));

    $db['users'] = array_values(array_filter($db['users'], function($usr) use ($teacherId, $schoolId, $schoolCode, $schoolName) {
        if (($usr['id'] ?? '') === $teacherId) {
            return !matchesSchool($usr, $schoolId, $schoolCode, $schoolName);
        }
        return true;
    }));
    saveDb($db);
    jsonOut(['ok' => true]);
}

// Update Teacher (POST /api/school/teachers/update)
if ($route === 'school/teachers/update' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (!isSchoolAdminRecord($u) && !isAdmin($db, $b['token'] ?? null))) {
        errorOut('Not authorised', 403);
    }
    $schoolId = (string)($u['schoolId'] ?? '');
    $schoolCode = (string)($u['schoolCode'] ?? '');
    $schoolName = (string)($u['schoolName'] ?? '');
    $teacherId = trim((string)($b['teacherId'] ?? ''));
    if ($teacherId === '') errorOut('Teacher ID is required', 400);

    $found = false;
    foreach ($db['users'] as &$usr) {
        if (($usr['id'] ?? '') === $teacherId && matchesSchool($usr, $schoolId, $schoolCode, $schoolName)) {
            if (isset($b['name']) && trim((string)$b['name']) !== '') $usr['name'] = trim((string)$b['name']);
            if (isset($b['gender'])) $usr['gender'] = trim((string)$b['gender']);
            if (isset($b['email']) && filter_var($b['email'], FILTER_VALIDATE_EMAIL)) $usr['email'] = strtolower(trim((string)$b['email']));
            if (isset($b['assignedSubjects']) && is_array($b['assignedSubjects'])) $usr['assignedSubjects'] = $b['assignedSubjects'];
            if (isset($b['assignedLevels']) && is_array($b['assignedLevels'])) $usr['assignedLevels'] = $b['assignedLevels'];
            if (!empty($b['newPassword']) && strlen($b['newPassword']) >= 6) {
                $usr['passwordPlain'] = trim((string)$b['newPassword']);
                $usr['passwordHash'] = password_hash(trim((string)$b['newPassword']), PASSWORD_BCRYPT);
            }
            $usr['updatedAt'] = round(microtime(true) * 1000);
            $found = true;
            break;
        }
    }
    unset($usr);
    if (!$found) errorOut('Teacher not found in your school', 404);
    saveDb($db);
    jsonOut(['ok' => true]);
}

// Mount Student - Single (POST /api/school/students/add)
if ($route === 'school/students/add' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (($u['role'] ?? '') !== 'school_admin' && ($u['role'] ?? '') !== 'teacher' && ($u['role'] ?? '') !== 'admin')) {
        errorOut('Not authorised', 403);
    }

    $schoolId = (string)($u['schoolId'] ?? '');
    $schoolName = (string)($u['schoolName'] ?? '');
    $schoolCode = (string)($u['schoolCode'] ?? '');

    $name = trim((string)($b['name'] ?? ''));
    $gender = trim((string)($b['gender'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $studentCode = trim((string)($b['studentCode'] ?? ($b['studentId'] ?? '')));
    $password = trim((string)($b['password'] ?? ''));
    if ($password === '') $password = 'Student2026#';
    $gradeLevel = normLevel($b['gradeLevel'] ?? 4) ?? 4;
    $classSection = trim((string)($b['classSection'] ?? ''));

    if ($name === '') errorOut('Student name is required', 400);

    $studentId = generateUuid();
    if ($studentCode === '' || stripos($studentCode, 'STU-') === 0) {
        $existingCount = 0;
        foreach ($db['users'] as $su) {
            if ((($su['schoolId'] ?? '') === $schoolId || ($su['schoolCode'] ?? '') === $schoolCode) &&
                (($su['role'] ?? '') === 'student' || ($su['accountType'] ?? '') === 'student')) {
                $existingCount++;
            }
        }
        $regNumber = $existingCount + 1;
        $cleanPrefix = $schoolCode !== '' ? $schoolCode : 'SCH';
        $studentCode = $cleanPrefix . '-' . str_pad((string)$regNumber, 3, '0', STR_PAD_LEFT);
    }

    $cleanSchool = strtolower(preg_replace('/[^a-z0-9]/', '', $schoolCode ?: 'sch'));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $cleanName = strtolower(preg_replace('/[^a-z0-9]/', '', $name));
        $email = $cleanSchool . '.' . substr($studentId, 0, 8) . '@student.codecasticgh.com';
    }

    $now = round(microtime(true) * 1000);
    $studentRecord = [
        'id' => $studentId,
        'name' => $name,
        'gender' => $gender,
        'email' => $email,
        'studentCode' => $studentCode,
        'role' => 'student',
        'accountType' => 'student',
        'schoolId' => $schoolId,
        'schoolName' => $schoolName,
        'schoolCode' => $schoolCode,
        'gradeLevel' => $gradeLevel,
        'classSection' => $classSection,
        'passwordPlain' => $password,
        'passwordHash' => password_hash($password, PASSWORD_BCRYPT),
        'createdAt' => $now
    ];

    $db['users'][] = $studentRecord;
    saveDb($db);

    jsonOut(['ok' => true, 'student' => publicUser($studentRecord)], 201);
}

// Bulk Mount Students (POST /api/school/students/bulk)
if ($route === 'school/students/bulk' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (($u['role'] ?? '') !== 'school_admin' && ($u['role'] ?? '') !== 'teacher' && ($u['role'] ?? '') !== 'admin')) {
        errorOut('Not authorised', 403);
    }

    $schoolId = (string)($u['schoolId'] ?? '');
    $schoolName = (string)($u['schoolName'] ?? '');
    $schoolCode = (string)($u['schoolCode'] ?? '');

    $studentRows = is_array($b['students'] ?? null) ? $b['students'] : [];
    if (empty($studentRows)) errorOut('No student records provided in payload', 400);

    $now = round(microtime(true) * 1000);
    $added = [];
    $skipped = [];
    $cleanSchool = strtolower(preg_replace('/[^a-z0-9]/', '', $schoolCode ?: 'sch'));
    $cleanPrefix = $schoolCode !== '' ? $schoolCode : 'SCH';

    $existingCount = 0;
    foreach ($db['users'] as $su) {
        if ((($su['schoolId'] ?? '') === $schoolId || ($su['schoolCode'] ?? '') === $schoolCode) &&
            (($su['role'] ?? '') === 'student' || ($su['accountType'] ?? '') === 'student')) {
            $existingCount++;
        }
    }

    foreach ($studentRows as $idx => $row) {
        $name = trim((string)($row['name'] ?? ''));
        if ($name === '') {
            $skipped[] = ['row' => $idx + 1, 'reason' => 'Student name is required'];
            continue;
        }

        $existingCount++;
        $studentCode = trim((string)($row['studentCode'] ?? ($row['studentId'] ?? '')));
        if ($studentCode === '' || stripos($studentCode, 'STU-') === 0) {
            $studentCode = $cleanPrefix . '-' . str_pad((string)$existingCount, 3, '0', STR_PAD_LEFT);
        }

        $rawLevel = $row['gradeLevel'] ?? 4;
        $lvl = normLevel($rawLevel) ?? 4;
        $section = trim((string)($row['classSection'] ?? ''));
        $gender = trim((string)($row['gender'] ?? ''));
        $pw = trim((string)($row['password'] ?? ''));
        if ($pw === '') $pw = 'Student2026#';

        $sid = generateUuid();
        $email = strtolower(trim((string)($row['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $email = $cleanSchool . '.' . substr($sid, 0, 8) . '@student.codecasticgh.com';
        }

        $record = [
            'id' => $sid,
            'name' => $name,
            'gender' => $gender,
            'email' => $email,
            'studentCode' => $studentCode,
            'role' => 'student',
            'accountType' => 'student',
            'schoolId' => $schoolId,
            'schoolName' => $schoolName,
            'schoolCode' => $schoolCode,
            'gradeLevel' => $lvl,
            'classSection' => $section,
            'passwordPlain' => $pw,
            'passwordHash' => password_hash($pw, PASSWORD_BCRYPT),
            'createdAt' => $now
        ];

        $db['users'][] = $record;
        $added[] = publicUser($record);
    }

    if (!empty($added)) {
        saveDb($db);
    }

    jsonOut([
        'ok' => true,
        'addedCount' => count($added),
        'skippedCount' => count($skipped),
        'added' => $added,
        'skipped' => $skipped
    ]);
}

// List School Students (GET or POST /api/school/students)
if ($route === 'school/students' && ($method === 'GET' || $method === 'POST')) {
    $b = getJsonBody();
    $token = $b['token'] ?? ($_GET['token'] ?? null);
    $u = getUserByToken($db, $token);
    if (!$u) errorOut('Not authorised', 401);

    $schoolId = (string)($u['schoolId'] ?? ($b['schoolId'] ?? ($_GET['schoolId'] ?? '')));
    if ($schoolId === '') errorOut('School ID required', 400);

    $studentExamsMap = [];
    $studentScoresMap = [];
    foreach ($db['results'] as $res) {
        if (($res['schoolId'] ?? '') === $schoolId) {
            $uid = (string)($res['userId'] ?? '');
            if ($uid !== '') {
                $studentExamsMap[$uid] = ($studentExamsMap[$uid] ?? 0) + 1;
                $studentScoresMap[$uid][] = (float)($res['percent'] ?? 0);
            }
        }
    }

    $students = [];
    foreach ($db['users'] as $usr) {
        if (($usr['schoolId'] ?? '') === $schoolId && (($usr['role'] ?? '') === 'student' || ($usr['accountType'] ?? '') === 'student')) {
            $pub = publicUser($usr);
            $uid = $pub['id'];
            $scores = $studentScoresMap[$uid] ?? [];
            $pub['examsTaken'] = $studentExamsMap[$uid] ?? 0;
            $pub['avgScore'] = count($scores) > 0 ? round(array_sum($scores) / count($scores)) : 0;
            $students[] = $pub;
        }
    }

    usort($students, function($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });

    jsonOut(['students' => $students]);
}

// Delete Student (POST /api/school/students/delete)
if ($route === 'school/students/delete' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (($u['role'] ?? '') !== 'school_admin' && ($u['role'] ?? '') !== 'admin')) {
        errorOut('Not authorised', 403);
    }
    $schoolId = (string)($u['schoolId'] ?? '');
    $studentId = trim((string)($b['studentId'] ?? ''));

    $db['users'] = array_values(array_filter($db['users'], function($usr) use ($studentId, $schoolId) {
        if (($usr['id'] ?? '') === $studentId) {
            return ($usr['schoolId'] ?? '') !== $schoolId;
        }
        return true;
    }));
    saveDb($db);
    jsonOut(['ok' => true]);
}

// Update Student (POST /api/school/students/update)
if ($route === 'school/students/update' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (($u['role'] ?? '') !== 'school_admin' && ($u['role'] ?? '') !== 'admin')) {
        errorOut('Not authorised', 403);
    }
    $schoolId = (string)($u['schoolId'] ?? '');
    $studentId = trim((string)($b['studentId'] ?? ''));
    if ($studentId === '') errorOut('Student ID is required', 400);

    $found = false;
    foreach ($db['users'] as &$usr) {
        if (($usr['id'] ?? '') === $studentId && ($usr['schoolId'] ?? '') === $schoolId) {
            if (isset($b['name']) && trim((string)$b['name']) !== '') $usr['name'] = trim((string)$b['name']);
            if (isset($b['gender'])) $usr['gender'] = trim((string)$b['gender']);
            if (isset($b['gradeLevel'])) $usr['gradeLevel'] = normLevel($b['gradeLevel']) ?? $usr['gradeLevel'];
            if (isset($b['classSection'])) $usr['classSection'] = trim((string)$b['classSection']);
            if (isset($b['studentCode']) && trim((string)$b['studentCode']) !== '') $usr['studentCode'] = trim((string)$b['studentCode']);
            if (!empty($b['newPassword']) && strlen($b['newPassword']) >= 6) {
                $usr['passwordPlain'] = trim((string)$b['newPassword']);
                $usr['passwordHash'] = password_hash(trim((string)$b['newPassword']), PASSWORD_BCRYPT);
            }
            $usr['updatedAt'] = round(microtime(true) * 1000);
            $found = true;
            break;
        }
    }
    unset($usr);
    if (!$found) errorOut('Student not found in your school', 404);
    saveDb($db);
    jsonOut(['ok' => true]);
}

// School-wide Performance Analytics (POST /api/school/performance)
if ($route === 'school/performance' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (!isSchoolAdminRecord($u) && !isAdmin($db, $b['token'] ?? null))) {
        errorOut('Not authorised', 403);
    }

    $schoolId = (string)($u['schoolId'] ?? ($b['schoolId'] ?? ''));
    $schoolCode = (string)($u['schoolCode'] ?? ($b['schoolCode'] ?? ''));
    $schoolName = (string)($u['schoolName'] ?? ($b['schoolName'] ?? ''));
    if ($schoolId === '' && $schoolCode === '' && $schoolName === '') errorOut('School ID required', 400);

    $schoolCategory = '';
    if (!empty($db['schools']) && is_array($db['schools'])) {
        foreach ($db['schools'] as $sc) {
            if (matchesSchool($sc, $schoolId, $schoolCode, $schoolName)) {
                $schoolCategory = (string)($sc['category'] ?? '');
                break;
            }
        }
    }
    if ($schoolCategory === '' && !empty($u['schoolCategory'])) {
        $schoolCategory = (string)$u['schoolCategory'];
    }

    $studentCount = 0;
    $teacherCount = 0;
    $maleCount = 0;
    $femaleCount = 0;
    $studentGenderMap = [];
    foreach ($db['users'] as $usr) {
        if (matchesSchool($usr, $schoolId, $schoolCode, $schoolName)) {
            if (isTeacherRecord($usr)) {
                $teacherCount++;
            } elseif (($usr['role'] ?? '') === 'student' || ($usr['accountType'] ?? '') === 'student') {
                $studentCount++;
                $g = strtolower(trim((string)($usr['gender'] ?? '')));
                if ($g === 'male' || $g === 'm') $maleCount++;
                elseif ($g === 'female' || $g === 'f') $femaleCount++;
                $studentGenderMap[(string)($usr['id'] ?? '')] = $usr['gender'] ?? '';
            }
        }
    }

    $schoolResults = [];
    $subjectStats = [];
    $levelStats = [];
    $totalExams = 0;
    $totalPassed = 0;
    $allPercents = [];
    $malePercents = [];
    $femalePercents = [];
    $malePassed = 0;
    $femalePassed = 0;

    foreach ($db['results'] as $res) {
        if (($res['schoolId'] ?? '') === $schoolId) {
            $totalExams++;
            $pct = (float)($res['percent'] ?? 0);
            $allPercents[] = $pct;
            $isPass = !empty($res['passed']) || $pct >= 50;
            if ($isPass) $totalPassed++;

            $uid = (string)($res['userId'] ?? '');
            $g = strtolower(trim((string)($res['gender'] ?? ($studentGenderMap[$uid] ?? ''))));
            if ($g === 'male' || $g === 'm') {
                $malePercents[] = $pct;
                if ($isPass) $malePassed++;
            } elseif ($g === 'female' || $g === 'f') {
                $femalePercents[] = $pct;
                if ($isPass) $femalePassed++;
            }

            $sName = (string)($res['subjectName'] ?? 'General');
            if (!isset($subjectStats[$sName])) {
                $subjectStats[$sName] = ['subjectName' => $sName, 'examsCount' => 0, 'totalPercent' => 0, 'passedCount' => 0];
            }
            $subjectStats[$sName]['examsCount']++;
            $subjectStats[$sName]['totalPercent'] += $pct;
            if ($isPass) $subjectStats[$sName]['passedCount']++;

            $lvl = (string)($res['level'] ?? 'Other');
            $lvlLabel = is_numeric($lvl) ? "Basic $lvl" : $lvl;
            if (!isset($levelStats[$lvlLabel])) {
                $levelStats[$lvlLabel] = ['levelLabel' => $lvlLabel, 'examsCount' => 0, 'totalPercent' => 0, 'passedCount' => 0];
            }
            $levelStats[$lvlLabel]['examsCount']++;
            $levelStats[$lvlLabel]['totalPercent'] += $pct;
            if ($isPass) $levelStats[$lvlLabel]['passedCount']++;

            $schoolResults[] = [
                'id' => $res['id'] ?? '',
                'studentName' => $res['studentName'] ?? 'Student',
                'studentEmail' => $res['studentEmail'] ?? '',
                'gender' => $res['gender'] ?? ($studentGenderMap[$uid] ?? ''),
                'classSection' => $res['classSection'] ?? '',
                'level' => $res['level'] ?? '',
                'subjectName' => $res['subjectName'] ?? '',
                'score' => $res['score'] ?? 0,
                'total' => $res['total'] ?? 0,
                'percent' => $pct,
                'passed' => $isPass,
                'createdAt' => $res['createdAt'] ?? 0
            ];
        }
    }

    usort($schoolResults, function($a, $b) {
        return ($b['createdAt'] ?? 0) <=> ($a['createdAt'] ?? 0);
    });

    $subjectBreakdown = [];
    foreach ($subjectStats as $item) {
        $cnt = $item['examsCount'];
        $subjectBreakdown[] = [
            'subjectName' => $item['subjectName'],
            'examsCount' => $cnt,
            'avgPercent' => $cnt > 0 ? round($item['totalPercent'] / $cnt) : 0,
            'passRate' => $cnt > 0 ? round(($item['passedCount'] / $cnt) * 100) : 0
        ];
    }
    usort($subjectBreakdown, function($a, $b) {
        return $b['examsCount'] <=> $a['examsCount'];
    });

    $levelBreakdown = [];
    foreach ($levelStats as $item) {
        $cnt = $item['examsCount'];
        $levelBreakdown[] = [
            'levelLabel' => $item['levelLabel'],
            'examsCount' => $cnt,
            'avgPercent' => $cnt > 0 ? round($item['totalPercent'] / $cnt) : 0,
            'passRate' => $cnt > 0 ? round(($item['passedCount'] / $cnt) * 100) : 0
        ];
    }

    $overallAvg = count($allPercents) > 0 ? round(array_sum($allPercents) / count($allPercents)) : 0;
    $overallPassRate = $totalExams > 0 ? round(($totalPassed / $totalExams) * 100) : 0;

    $genderBreakdown = [
        'maleCount' => $maleCount,
        'femaleCount' => $femaleCount,
        'maleAvg' => count($malePercents) > 0 ? round(array_sum($malePercents) / count($malePercents)) : 0,
        'femaleAvg' => count($femalePercents) > 0 ? round(array_sum($femalePercents) / count($femalePercents)) : 0,
        'malePassRate' => count($malePercents) > 0 ? round(($malePassed / count($malePercents)) * 100) : 0,
        'femalePassRate' => count($femalePercents) > 0 ? round(($femalePassed / count($femalePercents)) * 100) : 0,
        'maleExams' => count($malePercents),
        'femaleExams' => count($femalePercents)
    ];

    jsonOut([
        'ok' => true,
        'category' => $schoolCategory,
        'studentCount' => $studentCount,
        'teacherCount' => $teacherCount,
        'totalExams' => $totalExams,
        'overallAvg' => $overallAvg,
        'overallPassRate' => $overallPassRate,
        'genderBreakdown' => $genderBreakdown,
        'subjectBreakdown' => $subjectBreakdown,
        'levelBreakdown' => $levelBreakdown,
        'recentResults' => array_slice($schoolResults, 0, 100)
    ]);
}

// Subject Teacher Performance Analytics (POST /api/teacher/performance)
if ($route === 'teacher/performance' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (!in_array($u['role'] ?? '', ['teacher', 'school_admin', 'admin', 'superadmin', 'editor'], true) && !isTeacherRecord($u) && !isSchoolAdminRecord($u))) {
        errorOut('Not authorised. Teacher account required.', 403);
    }

    $schoolId = (string)($u['schoolId'] ?? ($b['schoolId'] ?? ''));
    $schoolCode = (string)($u['schoolCode'] ?? ($b['schoolCode'] ?? ''));
    $schoolName = (string)($u['schoolName'] ?? ($b['schoolName'] ?? ''));

    $assignedSubjects = is_array($u['assignedSubjects'] ?? null) ? $u['assignedSubjects'] : [];
    $assignedLevels = is_array($u['assignedLevels'] ?? null) ? $u['assignedLevels'] : [];
    $classSections = is_array($u['classSections'] ?? null) ? $u['classSections'] : [];

    $normSubjs = array_map(function($s) { return strtolower(trim((string)$s)); }, $assignedSubjects);
    $normLvls = array_map(function($l) {
        $s = strtolower(trim((string)$l));
        $s = str_replace('basic ', '', $s);
        return $s;
    }, $assignedLevels);

    $myStudents = [];
    $myStudentIds = [];
    foreach ($db['users'] as $usr) {
        if (matchesSchool($usr, $schoolId, $schoolCode, $schoolName) && (($usr['role'] ?? '') === 'student' || ($usr['accountType'] ?? '') === 'student')) {
            $studentLvl = strtolower(trim((string)($usr['gradeLevel'] ?? '')));
            $studentLvlClean = str_replace('basic ', '', $studentLvl);
            $studentSec = trim((string)($usr['classSection'] ?? ''));

            $levelMatch = empty($normLvls) || in_array($studentLvlClean, $normLvls, true) || in_array($studentLvl, $normLvls, true);
            $sectionMatch = empty($classSections) || in_array($studentSec, $classSections, true);

            // Match if levels match or if section matches. If teacher has specific sections, filter by section as well.
            if ($levelMatch) {
                if (!empty($classSections) && !$sectionMatch) {
                    continue;
                }
                $pub = publicUser($usr);
                $myStudents[] = $pub;
                $myStudentIds[$pub['id']] = true;
            } elseif ($sectionMatch && !empty($classSections)) {
                $pub = publicUser($usr);
                $myStudents[] = $pub;
                $myStudentIds[$pub['id']] = true;
            }
        }
    }

    $teacherResults = [];
    $totalExams = 0;
    $totalPassed = 0;
    $allPercents = [];
    $questionMissCounts = [];
    $classBreakdownMap = [];

    foreach ($db['results'] as $res) {
        $rUserId = (string)($res['userId'] ?? '');
        $isMyStudent = isset($myStudentIds[$rUserId]);
        $isSchoolMatch = matchesSchool($res, $schoolId, $schoolCode, $schoolName);

        if (!$isMyStudent && !$isSchoolMatch) continue;

        $rSubj = strtolower(trim((string)($res['subjectName'] ?? '')));
        $rSubjId = (string)($res['subjectId'] ?? '');
        $rLvl = strtolower(trim((string)($res['level'] ?? '')));
        $rLvlClean = str_replace('basic ', '', $rLvl);

        $subjectMatch = empty($normSubjs);
        if (!$subjectMatch) {
            foreach ($normSubjs as $as) {
                if ($as !== '' && (strpos($rSubj, $as) !== false || $rSubjId === $as)) {
                    $subjectMatch = true;
                    break;
                }
            }
        }
        if (!$subjectMatch) continue;

        $levelMatch = empty($normLvls) || in_array($rLvlClean, $normLvls, true) || in_array($rLvl, $normLvls, true) || $isMyStudent;
        if (!$levelMatch) continue;

        $pct = (float)($res['percent'] ?? 0);
        $passed = !empty($res['passed']) || $pct >= 50;
        $totalExams++;
        $allPercents[] = $pct;
        if ($passed) $totalPassed++;

        $cKey = is_numeric($res['level'] ?? '') ? 'Basic ' . $res['level'] : (string)($res['level'] ?? 'General');
        if (!empty($res['classSection'])) $cKey .= ' (' . $res['classSection'] . ')';
        if (!isset($classBreakdownMap[$cKey])) {
            $classBreakdownMap[$cKey] = ['classLabel' => $cKey, 'examsCount' => 0, 'totalPercent' => 0, 'passedCount' => 0];
        }
        $classBreakdownMap[$cKey]['examsCount']++;
        $classBreakdownMap[$cKey]['totalPercent'] += $pct;
        if ($passed) $classBreakdownMap[$cKey]['passedCount']++;

        if (!empty($res['details']) && is_array($res['details'])) {
            foreach ($res['details'] as $det) {
                $qid = (string)($det['questionId'] ?? ($det['id'] ?? ''));
                $isCor = !empty($det['isCorrect']) || !empty($det['correct']);
                if (!$isCor && $qid !== '') {
                    if (!isset($questionMissCounts[$qid])) {
                        $questionMissCounts[$qid] = [
                            'questionId' => $qid,
                            'text' => $det['text'] ?? '',
                            'missCount' => 0,
                            'explanation' => $det['explanation'] ?? ''
                        ];
                    }
                    $questionMissCounts[$qid]['missCount']++;
                }
            }
        }

        $teacherResults[] = [
            'id' => $res['id'] ?? '',
            'studentName' => $res['studentName'] ?? 'Student',
            'studentEmail' => $res['studentEmail'] ?? '',
            'classSection' => $res['classSection'] ?? '',
            'level' => $res['level'] ?? '',
            'subjectName' => $res['subjectName'] ?? '',
            'score' => $res['score'] ?? 0,
            'total' => $res['total'] ?? 0,
            'percent' => $pct,
            'passed' => $passed,
            'details' => $res['details'] ?? [],
            'createdAt' => $res['createdAt'] ?? 0
        ];
    }

    usort($teacherResults, function($a, $b) {
        return ($b['createdAt'] ?? 0) <=> ($a['createdAt'] ?? 0);
    });

    $classBreakdown = [];
    foreach ($classBreakdownMap as $item) {
        $cnt = $item['examsCount'];
        $classBreakdown[] = [
            'classLabel' => $item['classLabel'],
            'examsCount' => $cnt,
            'avgPercent' => $cnt > 0 ? round($item['totalPercent'] / $cnt) : 0,
            'passRate' => $cnt > 0 ? round(($item['passedCount'] / $cnt) * 100) : 0
        ];
    }

    $topMissedQuestions = array_values($questionMissCounts);
    usort($topMissedQuestions, function($a, $b) {
        return $b['missCount'] <=> $a['missCount'];
    });

    $overallAvg = count($allPercents) > 0 ? round(array_sum($allPercents) / count($allPercents)) : 0;
    $overallPassRate = $totalExams > 0 ? round(($totalPassed / $totalExams) * 100) : 0;

    // Group results by student for individual Strengths and Weaknesses profiling
    $studentResultsMap = [];
    $studentSubjectScores = [];
    $topicStats = [];

    foreach ($teacherResults as $tr) {
        $sid = (string)($tr['userId'] ?? '');
        $sName = $tr['studentName'] ?? '';
        $sKey = $sid !== '' ? $sid : $sName;

        if (!isset($studentResultsMap[$sKey])) {
            $studentResultsMap[$sKey] = [];
        }
        $studentResultsMap[$sKey][] = $tr;

        $sub = $tr['subjectName'] ?: 'General';
        if (!isset($studentSubjectScores[$sKey][$sub])) {
            $studentSubjectScores[$sKey][$sub] = [];
        }
        $studentSubjectScores[$sKey][$sub][] = $tr['percent'];

        if (!empty($tr['details']) && is_array($tr['details'])) {
            foreach ($tr['details'] as $det) {
                $topic = trim((string)($det['category'] ?? ''));
                if ($topic === '') $topic = $sub;
                if (!isset($topicStats[$topic])) {
                    $topicStats[$topic] = ['topic' => $topic, 'total' => 0, 'correct' => 0];
                }
                $topicStats[$topic]['total']++;
                if (!empty($det['isCorrect']) || !empty($det['correct'])) {
                    $topicStats[$topic]['correct']++;
                }
            }
        }
    }

    // Enhance student roster with actionable strengths and weaknesses
    foreach ($myStudents as &$stud) {
        $sid = $stud['id'];
        $sName = $stud['name'];
        $sKey = isset($studentResultsMap[$sid]) ? $sid : (isset($studentResultsMap[$sName]) ? $sName : null);
        $sAttempts = $sKey !== null ? $studentResultsMap[$sKey] : [];

        $stud['examsTaken'] = count($sAttempts);
        $stud['avgScore'] = 0;
        $stud['passRate'] = 0;
        $stud['strengths'] = [];
        $stud['weaknesses'] = [];
        $stud['recentResults'] = array_slice($sAttempts, 0, 5);

        if (count($sAttempts) > 0) {
            $sPercents = array_column($sAttempts, 'percent');
            $stud['avgScore'] = round(array_sum($sPercents) / count($sPercents));
            $sPassed = count(array_filter($sAttempts, function($a) { return !empty($a['passed']) || $a['percent'] >= 50; }));
            $stud['passRate'] = round(($sPassed / count($sAttempts)) * 100);

            if (isset($studentSubjectScores[$sKey])) {
                foreach ($studentSubjectScores[$sKey] as $subName => $pcts) {
                    $subAvg = round(array_sum($pcts) / count($pcts));
                    if ($subAvg >= 70) {
                        $stud['strengths'][] = "$subName ($subAvg%)";
                    } elseif ($subAvg < 50) {
                        $stud['weaknesses'][] = "$subName ($subAvg%)";
                    }
                }
            }
        }
    }
    unset($stud);

    // Class-wide competency diagnostics (strengths vs weaknesses)
    $competencyDiagnostics = [];
    foreach ($topicStats as $tStat) {
        $acc = $tStat['total'] > 0 ? round(($tStat['correct'] / $tStat['total']) * 100) : 0;
        $status = $acc >= 70 ? 'strength' : ($acc < 50 ? 'weakness' : 'moderate');
        $competencyDiagnostics[] = [
            'topic' => $tStat['topic'],
            'accuracy' => $acc,
            'totalQuestions' => $tStat['total'],
            'correctCount' => $tStat['correct'],
            'status' => $status
        ];
    }
    usort($competencyDiagnostics, function($a, $b) {
        return $a['accuracy'] <=> $b['accuracy'];
    });

    jsonOut([
        'ok' => true,
        'teacher' => publicUser($u),
        'myStudentsCount' => count($myStudents),
        'totalExams' => $totalExams,
        'overallAvg' => $overallAvg,
        'overallPassRate' => $overallPassRate,
        'classBreakdown' => $classBreakdown,
        'studentRoster' => $myStudents,
        'competencyDiagnostics' => $competencyDiagnostics,
        'results' => array_slice($teacherResults, 0, 100),
        'topMissedQuestions' => array_slice($topMissedQuestions, 0, 15)
    ]);
}

// -----------------------------------------------------------------------------
// Teacher Quiz Assignment Endpoints
// -----------------------------------------------------------------------------

// GET /api/teacher/questions/pool
if ($route === 'teacher/questions/pool' && $method === 'GET') {
    $level = trim((string)($_GET['level'] ?? ''));
    $subjectParam = trim((string)($_GET['subject'] ?? ''));
    if ($subjectParam === '') {
        errorOut('Subject parameter required', 400);
    }

    $subId = $subjectParam;
    $subName = $subjectParam;
    foreach ($db['subjects'] as $s) {
        if (($s['id'] ?? '') === $subjectParam || strcasecmp((string)($s['name'] ?? ''), $subjectParam) === 0) {
            $subId = (string)($s['id'] ?? '');
            $subName = (string)($s['name'] ?? '');
            break;
        }
    }

    $pool = [];
    $targetLvl = str_replace('basic ', '', strtolower($level));

    foreach ($db['questions'] as $q) {
        $qSubId = (string)($q['subjectId'] ?? '');
        $qSubName = (string)($q['subjectName'] ?? '');
        $matchSub = ($qSubId === $subId || strcasecmp($qSubName, $subName) === 0);
        if (!$matchSub) continue;

        if ($level !== '' && $level !== 'all') {
            $qLvl = str_replace('basic ', '', strtolower((string)($q['level'] ?? '')));
            $matchLvl = ($qLvl === $targetLvl);
            if (!$matchLvl && in_array($targetLvl, ['7', '8', '9', 'bece'], true) && in_array($qLvl, ['7', '8', '9', 'bece'], true)) {
                $matchLvl = true;
            }
            if (!$matchLvl && in_array($targetLvl, ['4', '5', '6'], true) && in_array($qLvl, ['4', '5', '6'], true)) {
                $matchLvl = true;
            }
            if (!$matchLvl && in_array($targetLvl, ['shs 1', 'shs 2', 'shs 3', 'wassce', 'shs'], true) && in_array($qLvl, ['shs 1', 'shs 2', 'shs 3', 'wassce', 'shs'], true)) {
                $matchLvl = true;
            }
            if (!$matchLvl) continue;
        }

        $pool[] = [
            'id' => (string)($q['id'] ?? ''),
            'text' => (string)($q['text'] ?? ''),
            'options' => is_array($q['options'] ?? null) ? $q['options'] : [],
            'category' => $q['category'] ?? null,
            'year' => $q['year'] ?? null,
            'explanation' => $q['explanation'] ?? null,
            'level' => $q['level'] ?? null,
            'subjectId' => $q['subjectId'] ?? null
        ];
    }

    jsonOut([
        'ok' => true,
        'totalAvailable' => count($pool),
        'questions' => $pool
    ]);
}

// POST /api/teacher/quiz/create
if ($route === 'teacher/quiz/create' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (!in_array($u['role'] ?? '', ['teacher', 'school_admin', 'admin', 'superadmin', 'editor'], true) && !isTeacherRecord($u) && !isSchoolAdminRecord($u))) {
        errorOut('Teacher or school admin authorization required', 403);
    }

    $title = trim((string)($b['title'] ?? ''));
    $subjectName = trim((string)($b['subjectName'] ?? ''));
    $gradeLevel = trim((string)($b['gradeLevel'] ?? ''));
    $studentIds = is_array($b['studentIds'] ?? null) ? array_map('strval', $b['studentIds']) : [];
    $studentIds = array_values(array_filter($studentIds));
    $reqCount = max(1, (int)($b['questionCount'] ?? 10));
    $timerSeconds = max(0, isset($b['timerSeconds']) ? (int)$b['timerSeconds'] : 60);
    $explicitQIds = is_array($b['questionIds'] ?? null) ? array_map('strval', $b['questionIds']) : [];
    $explicitQIds = array_values(array_filter($explicitQIds));

    if ($title === '') errorOut('Quiz title is required', 400);
    if ($subjectName === '') errorOut('Subject is required', 400);
    if ($gradeLevel === '') errorOut('Grade level is required', 400);
    if (empty($studentIds)) errorOut('Please select at least one student to assign the quiz to', 400);

    $subId = $subjectName;
    $subMatchedName = $subjectName;
    foreach ($db['subjects'] as $s) {
        if (($s['id'] ?? '') === $subjectName || strcasecmp((string)($s['name'] ?? ''), $subjectName) === 0) {
            $subId = (string)($s['id'] ?? '');
            $subMatchedName = (string)($s['name'] ?? '');
            break;
        }
    }

    $finalQuestionIds = [];

    // If teacher authored custom questions specifically for this quiz
    $customQuestions = is_array($b['customQuestions'] ?? null) ? $b['customQuestions'] : [];
    if (!empty($customQuestions)) {
        foreach ($customQuestions as $cq) {
            $qText = trim((string)($cq['text'] ?? ''));
            if ($qText === '') continue;
            $qOpts = is_array($cq['options'] ?? null) ? array_map('strval', $cq['options']) : [];
            if (count($qOpts) < 2) continue;
            $qCorrect = isset($cq['correctIndex']) ? (int)$cq['correctIndex'] : 0;
            $qExpl = trim((string)($cq['explanation'] ?? ''));
            $newQId = 'q_custom_' . generateUuid();

            $newQ = [
                'id' => $newQId,
                'text' => $qText,
                'options' => $qOpts,
                'correctIndex' => $qCorrect,
                'explanation' => $qExpl,
                'level' => $gradeLevel,
                'subjectId' => $subId,
                'subjectName' => $subMatchedName,
                'createdBy' => (string)($u['id'] ?? ''),
                'teacherName' => (string)($u['name'] ?? 'Teacher'),
                'isCustom' => true,
                'createdAt' => (int)(microtime(true) * 1000)
            ];

            $db['questions'][] = $newQ;
            $finalQuestionIds[] = $newQId;
        }
    } elseif (!empty($explicitQIds)) {
        $finalQuestionIds = $explicitQIds;
    } else {
        $candidateIds = [];
        $targetLvl = str_replace('basic ', '', strtolower($gradeLevel));
        foreach ($db['questions'] as $q) {
            $qSubId = (string)($q['subjectId'] ?? '');
            $qSubName = (string)($q['subjectName'] ?? '');
            $matchSub = ($qSubId === $subId || strcasecmp($qSubName, $subMatchedName) === 0);
            if (!$matchSub) continue;

            $qLvl = str_replace('basic ', '', strtolower((string)($q['level'] ?? '')));
            $matchLvl = ($qLvl === $targetLvl);
            if (!$matchLvl && in_array($targetLvl, ['7', '8', '9', 'bece'], true) && in_array($qLvl, ['7', '8', '9', 'bece'], true)) {
                $matchLvl = true;
            }
            if (!$matchLvl && in_array($targetLvl, ['4', '5', '6'], true) && in_array($qLvl, ['4', '5', '6'], true)) {
                $matchLvl = true;
            }
            if (!$matchLvl && in_array($targetLvl, ['shs 1', 'shs 2', 'shs 3', 'wassce', 'shs'], true) && in_array($qLvl, ['shs 1', 'shs 2', 'shs 3', 'wassce', 'shs'], true)) {
                $matchLvl = true;
            }
            if ($matchLvl) {
                $candidateIds[] = (string)($q['id'] ?? '');
            }
        }

        if (count($candidateIds) === 0) {
            foreach ($db['questions'] as $q) {
                $qSubId = (string)($q['subjectId'] ?? '');
                $qSubName = (string)($q['subjectName'] ?? '');
                if ($qSubId === $subId || strcasecmp($qSubName, $subMatchedName) === 0) {
                    $candidateIds[] = (string)($q['id'] ?? '');
                }
            }
        }

        shuffle($candidateIds);
        $finalQuestionIds = array_slice($candidateIds, 0, $reqCount);
    }

    if (empty($finalQuestionIds)) {
        errorOut('No questions available in the question pool for ' . $subjectName . ' (' . $gradeLevel . ')', 400);
    }

    $assignmentId = 'asgn_' . time() . '_' . bin2hex(random_bytes(4));
    $assignmentRecord = [
        'id' => $assignmentId,
        'title' => $title,
        'teacherId' => (string)($u['id'] ?? ''),
        'teacherName' => (string)($u['name'] ?? 'Teacher'),
        'schoolId' => (string)($u['schoolId'] ?? ''),
        'subjectId' => $subId,
        'subjectName' => $subMatchedName,
        'gradeLevel' => $gradeLevel,
        'questionCount' => count($finalQuestionIds),
        'questionIds' => $finalQuestionIds,
        'assignedStudentIds' => $studentIds,
        'timerSeconds' => $timerSeconds,
        'status' => 'active',
        'createdAt' => (int)(microtime(true) * 1000)
    ];

    if (!isset($db['quiz_assignments']) || !is_array($db['quiz_assignments'])) {
        $db['quiz_assignments'] = [];
    }
    $db['quiz_assignments'][] = $assignmentRecord;
    saveDb($db);

    jsonOut([
        'ok' => true,
        'assignmentId' => $assignmentId,
        'questionCount' => count($finalQuestionIds),
        'assignedCount' => count($studentIds),
        'assignment' => $assignmentRecord
    ]);
}

// POST /api/teacher/quiz/list
if ($route === 'teacher/quiz/list' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (!in_array($u['role'] ?? '', ['teacher', 'school_admin', 'admin', 'superadmin', 'editor'], true) && !isTeacherRecord($u) && !isSchoolAdminRecord($u))) {
        errorOut('Teacher or school admin authorization required', 403);
    }

    $uid = (string)($u['id'] ?? '');
    $schoolId = (string)($u['schoolId'] ?? '');
    $allAssignments = is_array($db['quiz_assignments'] ?? null) ? $db['quiz_assignments'] : [];
    $allUsers = is_array($db['users'] ?? null) ? $db['users'] : [];
    $allResults = is_array($db['results'] ?? null) ? $db['results'] : [];

    $userMap = [];
    foreach ($allUsers as $usr) {
        $userMap[(string)($usr['id'] ?? '')] = $usr;
    }

    $filtered = [];
    foreach ($allAssignments as $asgn) {
        if (($u['role'] ?? '') === 'admin' || ($u['role'] ?? '') === 'superadmin') {
            $filtered[] = $asgn;
        } elseif (($u['role'] ?? '') === 'school_admin') {
            if (($asgn['schoolId'] ?? '') === $schoolId) $filtered[] = $asgn;
        } else {
            if (($asgn['teacherId'] ?? '') === $uid || (($asgn['schoolId'] ?? '') === $schoolId && ($asgn['schoolId'] ?? '') !== '')) {
                $filtered[] = $asgn;
            }
        }
    }

    $enriched = [];
    foreach ($filtered as $asgn) {
        $assignedIds = is_array($asgn['assignedStudentIds'] ?? null) ? $asgn['assignedStudentIds'] : [];
        $studentStatuses = [];
        $completedCount = 0;

        foreach ($assignedIds as $sid) {
            $sid = (string)$sid;
            $sObj = $userMap[$sid] ?? null;
            $sName = $sObj ? ($sObj['name'] ?? 'Student') : 'Student';
            $sEmail = $sObj ? ($sObj['email'] ?? '') : '';
            $sSec = $sObj ? ($sObj['classSection'] ?? '') : '';

            $resMatch = null;
            foreach ($allResults as $res) {
                if (!empty($res['assignmentId']) && (string)$res['assignmentId'] === (string)($asgn['id'] ?? '') && (string)($res['userId'] ?? '') === $sid) {
                    $resMatch = $res;
                    break;
                }
                if ((string)($res['userId'] ?? '') === $sid &&
                    strcasecmp((string)($res['subjectName'] ?? ''), (string)($asgn['subjectName'] ?? '')) === 0 &&
                    (int)($res['createdAt'] ?? 0) >= (int)($asgn['createdAt'] ?? 0)) {
                    $resMatch = $res;
                    break;
                }
            }

            if ($resMatch) {
                $completedCount++;
                $studentStatuses[] = [
                    'studentId' => $sid,
                    'studentName' => $sName,
                    'studentEmail' => $sEmail,
                    'classSection' => $sSec,
                    'status' => 'Completed',
                    'score' => $resMatch['score'] ?? null,
                    'total' => $resMatch['total'] ?? null,
                    'percent' => $resMatch['percent'] ?? null,
                    'completedAt' => $resMatch['createdAt'] ?? null
                ];
            } else {
                $studentStatuses[] = [
                    'studentId' => $sid,
                    'studentName' => $sName,
                    'studentEmail' => $sEmail,
                    'classSection' => $sSec,
                    'status' => 'Pending',
                    'score' => null,
                    'total' => null,
                    'percent' => null,
                    'completedAt' => null
                ];
            }
        }

        $asgnCopy = $asgn;
        $asgnCopy['completedCount'] = $completedCount;
        $asgnCopy['totalAssigned'] = count($assignedIds);
        $asgnCopy['studentStatuses'] = $studentStatuses;
        $enriched[] = $asgnCopy;
    }

    usort($enriched, function($a, $b) {
        return (int)($b['createdAt'] ?? 0) <=> (int)($a['createdAt'] ?? 0);
    });

    jsonOut(['ok' => true, 'assignments' => $enriched]);
}

// POST /api/teacher/quiz/delete
if ($route === 'teacher/quiz/delete' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u || (!in_array($u['role'] ?? '', ['teacher', 'school_admin', 'admin', 'superadmin', 'editor'], true) && !isTeacherRecord($u) && !isSchoolAdminRecord($u))) {
        errorOut('Not authorised', 403);
    }

    $asgnId = (string)($b['assignmentId'] ?? '');
    if ($asgnId === '') errorOut('Assignment ID required', 400);

    if (isset($db['quiz_assignments']) && is_array($db['quiz_assignments'])) {
        $db['quiz_assignments'] = array_values(array_filter($db['quiz_assignments'], function($item) use ($asgnId) {
            return (string)($item['id'] ?? '') !== $asgnId;
        }));
        saveDb($db);
    }
    jsonOut(['ok' => true]);
}

// POST /api/student/assigned-quizzes
if ($route === 'student/assigned-quizzes' && $method === 'POST') {
    $b = getJsonBody();
    $u = getUserByToken($db, $b['token'] ?? null);
    if (!$u) errorOut('Student authorization required', 401);

    $uid = (string)($u['id'] ?? '');
    $allAssignments = is_array($db['quiz_assignments'] ?? null) ? $db['quiz_assignments'] : [];
    $allResults = is_array($db['results'] ?? null) ? $db['results'] : [];

    $myAssigned = [];
    foreach ($allAssignments as $a) {
        if (($a['status'] ?? '') !== '' && ($a['status'] ?? '') !== 'active') continue;
        $ids = is_array($a['assignedStudentIds'] ?? null) ? array_map('strval', $a['assignedStudentIds']) : [];
        if (in_array($uid, $ids, true)) {
            $myAssigned[] = $a;
        }
    }

    $list = [];
    foreach ($myAssigned as $asgn) {
        $asgnId = (string)($asgn['id'] ?? '');
        $resMatch = null;
        foreach ($allResults as $r) {
            if (!empty($r['assignmentId']) && (string)$r['assignmentId'] === $asgnId && (string)($r['userId'] ?? '') === $uid) {
                $resMatch = $r;
                break;
            }
            if ((string)($r['userId'] ?? '') === $uid &&
                strcasecmp((string)($r['subjectName'] ?? ''), (string)($asgn['subjectName'] ?? '')) === 0 &&
                (int)($r['createdAt'] ?? 0) >= (int)($asgn['createdAt'] ?? 0)) {
                $resMatch = $r;
                break;
            }
        }

        $list[] = [
            'id' => $asgnId,
            'title' => $asgn['title'] ?? 'Assigned Quiz',
            'subjectName' => $asgn['subjectName'] ?? '',
            'subjectId' => $asgn['subjectId'] ?? '',
            'gradeLevel' => $asgn['gradeLevel'] ?? '',
            'questionCount' => $asgn['questionCount'] ?? count($asgn['questionIds'] ?? []),
            'timerSeconds' => $asgn['timerSeconds'] ?? 60,
            'teacherName' => $asgn['teacherName'] ?? 'Teacher',
            'createdAt' => $asgn['createdAt'] ?? 0,
            'isCompleted' => ($resMatch !== null),
            'score' => $resMatch ? ($resMatch['score'] ?? null) : null,
            'total' => $resMatch ? ($resMatch['total'] ?? null) : null,
            'percent' => $resMatch ? ($resMatch['percent'] ?? null) : null,
            'passed' => $resMatch ? (!empty($resMatch['passed']) || ($resMatch['percent'] ?? 0) >= 50) : null
        ];
    }

    jsonOut(['ok' => true, 'assignedQuizzes' => $list]);
}

// Fallback: 404 for unknown API route
errorOut("Route not found: $method /api/$route", 404);


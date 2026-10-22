<?php
/**
 * Codecastic GH - Automated GitHub Webhook Deployment
 * 
 * GitHub Webhook URL: https://codecasticgh.com/deploy.php
 * Secret: codecastic_deploy_2026
 */

$secret = 'codecastic_deploy_2026';
$repo_dir = '/home/codecast/repositories/codecastic-gh';
$deploy_dir = '/home/codecast/public_html';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method Not Allowed. Send POST from GitHub Webhook.']);
    exit;
}

$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';

if ($signature && $secret) {
    $expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);
    if (!hash_equals($expected, $signature)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Invalid Webhook Signature.']);
        exit;
    }
}

$output = [];
$return_code = 0;

// 1. Pull latest commits from GitHub
exec("cd {$repo_dir} && git checkout main 2>&1 && git pull origin main 2>&1", $output, $return_code);

// 2. Deploy compiled files to public web directory
if (file_exists("{$repo_dir}/website/dist")) {
    @mkdir("{$deploy_dir}/dist", 0755, true);
    exec("cp -r {$repo_dir}/website/dist/* {$deploy_dir}/dist/ 2>&1", $output);
}
if (file_exists("{$repo_dir}/website/app.js")) {
    exec("cp {$repo_dir}/website/app.js {$deploy_dir}/app.js 2>&1", $output);
}
if (file_exists("{$repo_dir}/website/package.json")) {
    exec("cp {$repo_dir}/website/package.json {$deploy_dir}/package.json 2>&1", $output);
}

// 3. Restart Node.js application via Phusion Passenger restart hook
@mkdir("{$deploy_dir}/tmp", 0755, true);
exec("touch {$deploy_dir}/tmp/restart.txt 2>&1");

http_response_code(200);
header('Content-Type: application/json');
echo json_encode([
    'ok' => true,
    'message' => 'Deployment executed successfully.',
    'output' => $output
]);

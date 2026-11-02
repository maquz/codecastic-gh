import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const stagingDir = path.join(rootDir, 'dist-cpanel-staging');

console.log('Building website (frontend & backend)...');
execSync('npm --prefix website run build', { stdio: 'inherit' });

console.log('Cleaning staging directory...');
if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Copy website/dist contents to root of stagingDir
console.log('Copying static assets to root of package...');
fs.cpSync(path.join(rootDir, 'website', 'dist'), stagingDir, { recursive: true });

// Also copy website/dist to dist/ subfolder for Node app.js
console.log('Copying dist folder for app.js...');
fs.mkdirSync(path.join(stagingDir, 'dist'), { recursive: true });
fs.cpSync(path.join(rootDir, 'website', 'dist'), path.join(stagingDir, 'dist'), { recursive: true });

// Copy .htaccess
if (fs.existsSync(path.join(rootDir, 'website', '.htaccess'))) {
    fs.copyFileSync(path.join(rootDir, 'website', '.htaccess'), path.join(stagingDir, '.htaccess'));
}

// Copy app.js
fs.copyFileSync(path.join(rootDir, 'website', 'app.js'), path.join(stagingDir, 'app.js'));

// Copy website/package.json
fs.copyFileSync(path.join(rootDir, 'website', 'package.json'), path.join(stagingDir, 'package.json'));

// Copy data/db.json
if (fs.existsSync(path.join(rootDir, 'website', 'data'))) {
    fs.mkdirSync(path.join(stagingDir, 'data'), { recursive: true });
    fs.cpSync(path.join(rootDir, 'website', 'data'), path.join(stagingDir, 'data'), { recursive: true });
}

// Copy deploy.php
if (fs.existsSync(path.join(rootDir, 'deploy.php'))) {
    fs.copyFileSync(path.join(rootDir, 'deploy.php'), path.join(stagingDir, 'deploy.php'));
}

// Create deploy-cpanel.zip
console.log('Creating deploy-cpanel.zip...');
const zipFile = path.join(rootDir, 'deploy-cpanel.zip');
if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
}

execSync(`tar.exe -a -c -f "${zipFile}" -C "${stagingDir}" *`, { stdio: 'inherit' });

console.log('Cleaning up staging directory...');
fs.rmSync(stagingDir, { recursive: true, force: true });

console.log('Package created successfully: deploy-cpanel.zip');

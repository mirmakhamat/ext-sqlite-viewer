import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Lifecycle & Command Suite', () => {
    test('Command Palette Registration', async () => {
        const ext = vscode.extensions.getExtension('mirmakhamat.sqlite-viewer-pro') ||
                    vscode.extensions.getExtension('sqlite-viewer.sqlite-viewer') || 
                    vscode.extensions.getExtension('undefined_publisher.sqlite-viewer-pro');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
        
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('sqlite-viewer.openViewer'),
            'Command sqlite-viewer.openViewer should be registered in VS Code extension context'
        );
    });
});

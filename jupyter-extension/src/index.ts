import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILabShell,
} from '@jupyterlab/application';

import { IDocumentManager } from '@jupyterlab/docmanager';

/**
 * Initialization data for the notebookpack-runtime extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'notebookpack-runtime:plugin',
  description: 'NotebookPack Runtime Initializer',
  autoStart: true,
  requires: [ILabShell, IDocumentManager],
  activate: (jupyter_frontend: JupyterFrontEnd, ilabshell: ILabShell, idocumentmanager: IDocumentManager) => {
    console.log('JupyterLab extension notebookpack-runtime is activated!');
    (window as any).jupyter_frontend = jupyter_frontend;
    (window as any).ilabshell = ilabshell;
    (window as any).idocumentmanager = idocumentmanager;
  }
};

export default plugin;

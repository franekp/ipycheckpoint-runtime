import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILabShell,
} from '@jupyterlab/application';

import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentWidget, DocumentRegistry } from '@jupyterlab/docregistry';
import { ISharedNotebook, ISharedCell, SharedCell } from '@jupyter/ydoc';
import { Notebook, NotebookActions } from '@jupyterlab/notebook';
import { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class NotebookController {
  private isEmpty: boolean = true;
  private nb: Notebook;

  constructor(public doc: DocumentWidget) {
    this.nb = doc.content as Notebook;
  }

  async _waitForKernel(): Promise<IKernelConnection> {
    while (true) {
      if (this.doc.context.sessionContext.session?.kernel) {
        return this.doc.context.sessionContext.session.kernel;
      }
      await timeout(100);
    }
  }

  private _addCell(cell: SharedCell.Cell): ISharedCell {
    const model = this.nb.model as DocumentRegistry.IModel;
    const sharedModel = model.sharedModel as ISharedNotebook;
    const res = sharedModel.addCell(cell);
    if (this.isEmpty) {
      // empty notebooks start with a single empty cell
      // if that's the case, we delete this cell after adding the first non-empty one
      NotebookActions.cut(this.nb);
      this.isEmpty = false;
    }
    return res;
  }

  async executeHidden(code: string): Promise<void> {
    const kernel = await this._waitForKernel();
    await kernel.requestExecute({code}).done;
  }

  async initWithCodeCells(cells: string[]): Promise<void> {
    const targetNumCells = this.nb.widgets.length - (this.isEmpty ? 1 : 0) + cells.length;
    for (const cell_code of cells) {
      this._addCell({cell_type: 'code', source: cell_code});
    }
    while (this.nb.widgets.length < targetNumCells) {
      await timeout(100);
    }
  }

  async runAllCells(): Promise<void> {
    await NotebookActions.runAll(this.nb, this.doc.context.sessionContext);
  }
}

type Message =
  | { kind: 'IFrameToHost', type: 'InitialPayloadRequest' }
  | { kind: 'HostToIFrame', type: 'InitialPayloadResponse', envInitializer: string, initialCells: string[] }
  | { kind: 'IFrameToHost', type: 'NotebookReady' }

function waitForMessage<T extends Message['type']>(targetWindow: Window, type: T): Promise<Message & {type: T}> {
  return new Promise(resolve => {
    const handleMessage = (event: MessageEvent<Message>) => {
      const data = event.data;
      if (data.type === type) {
        console.log(`IFRAME: '${type}' received! initializing...`);
        targetWindow.removeEventListener('message', handleMessage);
        resolve(data as any);  // apparently generic type refinement is too much for TypeScript
      } else {
        console.log(`IFRAME: unknown message '${type}' received!`);
      }
    };
    targetWindow.addEventListener('message', handleMessage);
  })
}

/**
 * Initialization data for the notebookpack-runtime extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'notebookpack-runtime:plugin',
  description: 'NotebookPack Runtime Initializer',
  autoStart: true,
  requires: [ILabShell, IDocumentManager],
  activate: (jupyterFrontEnd: JupyterFrontEnd, ilabshell: ILabShell, idocumentmanager: IDocumentManager) => {
    console.log('JupyterLab extension notebookpack-runtime is activated!');
    (window as any).jupyter_frontend = jupyterFrontEnd;
    (window as any).ilabshell = ilabshell;
    (window as any).idocumentmanager = idocumentmanager;

    (async () => {
      await timeout(300);  // ILabShell needs some time to initialize...
      ilabshell.collapseLeft();
      ilabshell.collapseRight();
      ilabshell.toggleSideTabBarVisibility("left");
      ilabshell.toggleSideTabBarVisibility("right");
      ilabshell.mode = 'single-document';

      const doc = idocumentmanager.createNew('Untitled.ipynb', 'default', {name: 'python'});

      if (!doc || !(doc instanceof DocumentWidget)) {
        return;
      }

      (window as any).doc = doc;
      (window as any).Notebook = Notebook;
      (window as any).NotebookActions = NotebookActions;

      const nb = new NotebookController(doc);

      console.log(`IFRAME: sending 'InitialPayloadRequest' ...`);
      window.parent.postMessage({ kind: 'IFrameToHost', type: 'InitialPayloadRequest' }, '*');
      const payload = await waitForMessage(window, 'InitialPayloadResponse');

      await nb.executeHidden(payload.envInitializer);
      await nb.initWithCodeCells(payload.initialCells);
      await nb.runAllCells();

      window.parent.postMessage({ kind: 'IFrameToHost', type: 'NotebookReady' }, '*');
    })();
  }
};

export default plugin;

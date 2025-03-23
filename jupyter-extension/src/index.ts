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

const init_inherited_env = 'injected_var = "Hello World!"';
const print_inherited_env = `
print('Inherited globals:')
for _k, _v in list(globals().items()):
    if _k.startswith('_') or _k in ['In', 'Out', 'exit', 'quit', 'open', 'get_ipython']: continue
    print(f'    {_k}: {type(_v).__name__}')
`.trim();

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
      await timeout(300);
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
      await nb.executeHidden(init_inherited_env);
      await nb.initWithCodeCells([print_inherited_env, "print('Hello world!')"]);
      await nb.runAllCells();
    })();
  }
};

export default plugin;

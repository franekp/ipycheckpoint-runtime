import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILabShell,
} from '@jupyterlab/application';

import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentWidget, DocumentRegistry } from '@jupyterlab/docregistry';
import { ISharedNotebook, ISharedCell, SharedCell } from '@jupyter/ydoc';
import { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class Notebook {
  constructor(public doc: DocumentWidget) {}

  async _waitForKernel(): Promise<IKernelConnection> {
    while (true) {
      if (this.doc.context.sessionContext.session?.kernel) {
        return this.doc.context.sessionContext.session.kernel;
      }
      console.log('WAITING!!!');
      await timeout(100);
    }
  }

  private _addCell(cell: SharedCell.Cell): ISharedCell {
    const model = (this.doc.content as any).model as DocumentRegistry.IModel;
    const sharedModel = model.sharedModel as ISharedNotebook;
    return sharedModel.addCell(cell);
  }

  addCodeCell(code: string): ISharedCell {
    return this._addCell({cell_type: 'code', source: code})
  }

  async executeHidden(code: string) {
    const kernel = await this._waitForKernel();
    await kernel.requestExecute({code}).done;
  }

  async executeInNewCell(code: string): Promise<ISharedCell> {
    throw new Error("Unimplemented")
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

    ilabshell.collapseLeft();
    ilabshell.collapseRight();
    ilabshell.toggleSideTabBarVisibility("left");
    ilabshell.toggleSideTabBarVisibility("right");
    ilabshell.mode = 'single-document';

    const doc = idocumentmanager.createNew('Untitled3.ipynb', 'default', {name: 'python'});

    if (!doc || !(doc instanceof DocumentWidget)) {
      return;
    }

    const nb = new Notebook(doc);

    (async () => {
      await nb.executeHidden(init_inherited_env);
      nb.addCodeCell(print_inherited_env);
    })();

    (async () => {
      let kernel: IKernelConnection = await nb._waitForKernel();
      

      const execute_reply = await kernel.requestExecute({code: 'injected_var = "Hello World!"'}).done;
      console.log(execute_reply);
      console.log(JSON.stringify(execute_reply));

      const initialCell =`
print('Inherited globals:')
for _k, _v in list(globals().items()):
    if _k.startswith('_') or _k in ['In', 'Out', 'exit', 'quit', 'open', 'get_ipython']: continue
    print(f'    {_k}: {type(_v).__name__}')
`.trim();

      const fut = kernel.requestExecute({code: 'exec_num=2; print("a"); print("b"); [1, 2, 3]'});

      const stdout: string[] = [], final: string[] = [];
      const hook = (msg) => {
          if (msg.channel == 'iopub' && msg.content.name == 'stdout') { stdout.push(msg.content.text) }
          if (msg.channel == 'iopub' && 'data' in msg.content && 'text/plain' in msg.content.data) {
              final.push(msg.content.data['text/plain']);
          }
          return true;
      }
      fut.registerMessageHook(hook);

      doc.content.model.sharedModel.addCell()  // TODO: maybe construct the cell?

    });
  }
};

export default plugin;

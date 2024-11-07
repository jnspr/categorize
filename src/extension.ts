import * as vscode from "vscode";

const iconCache = new Map<string, vscode.ThemeIcon>();

/** Description of a category of exclusion patterns */
export type Category = {
  label: string | null;
  include: string[];
  exclude: string[];
  detail: string | null;
  iconName: string | null;
};

export function activate(context: vscode.ExtensionContext) {
  /** Gets a theme icon by name and caches it for later use */
  const getIconByName = (name: string): vscode.ThemeIcon | null => {
    let icon = iconCache.get(name);
    if (icon === undefined) {
      if (iconCache.size >= 128) {
        // Keep the cache small
        iconCache.clear();
      }
      icon = new vscode.ThemeIcon(name);
      iconCache.set(name, icon);
    }
    return icon;
  };

  /** Asks the user to pick a category */
  const pickCategory = async (
    configuration: vscode.WorkspaceConfiguration
  ): Promise<string | null> => {
    // Get the current set of configured categories
    let categories = configuration.get<Record<string, Category>>(
      "categorize.categories"
    );
    if (typeof categories !== "object" || !categories) {
      categories = {};
    }

    // Convert valid entries into quick pick items
    const showAllItem = {
      key: null,
      label: "Show all files",
      detail: "Disables any active category",
      description: "null",
      iconPath: getIconByName("explorer-view-icon	") ?? undefined,
    };
    const categoryItems = Object.entries(categories).map(
      ([name, category]): vscode.QuickPickItem & {
        key: string | null;
      } => ({
        label: category.label ? category.label : name,
        description: category.label ? name : undefined,
        detail: category.detail ?? undefined,
        iconPath: category.iconName
          ? (getIconByName(category.iconName) ?? undefined)
          : undefined,
        key: name,
      })
    );

    // Perform the quick pick action and return the resulting category's name
    const { key = null } =
      (await vscode.window.showQuickPick([showAllItem, ...categoryItems])) ??
      {};
    return key;
  };

  /** Applies the currently configured exclusion category */
  const applyCurrentCategory = async (
    configuration: vscode.WorkspaceConfiguration,
    currentCategory: string | null
  ) => {
    // Read the current category's included and excluded patterns
    let categories = configuration.get<Record<string, Category>>(
      "categorize.categories"
    );
    if (typeof categories !== "object" || !categories) {
      categories = {};
    }
    const category = currentCategory ? categories[currentCategory] : undefined;
    const include = category ? category.include : [];
    const exclude = category ? category.exclude : [];

    // Merge the unconditionally and conditionally included and excluded patterns into the VSCode `files.exclude` setting
    const excludeSetting = {
      ...(configuration.get<Record<string, boolean>>(
        "categorize.excludeAlways"
      ) ?? {}),
      ...Object.fromEntries([
        ...include.map((pattern) => [pattern, false]),
        ...exclude.map((pattern) => [pattern, true]),
      ]),
    };
    await configuration.update(
      "files.exclude",
      excludeSetting,
      vscode.ConfigurationTarget.Global
    );
  };

  // Implent the `Categorize: Pick category` action
  context.subscriptions.push(
    vscode.commands.registerCommand("categorize.pickCategory", async () => {
      const configuration = vscode.workspace.getConfiguration();
      const nextCategory = await pickCategory(configuration);
      await configuration.update(
        "categorize.currentCategory",
        nextCategory,
        vscode.ConfigurationTarget.Global
      );
      await applyCurrentCategory(configuration, nextCategory);
    })
  );

  // Implement the `Categorize: Force refresh` action
  context.subscriptions.push(
    vscode.commands.registerCommand("categorize.forceRefresh", async () => {
      const configuration = vscode.workspace.getConfiguration();
      await applyCurrentCategory(
        configuration,
        configuration.get<string | null>("categorize.currentCategory") ?? null
      );
      vscode.window.showInformationMessage("Category was refreshed.");
    })
  );
}

export function deactivate() {
  iconCache.clear();
}

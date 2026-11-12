import AppIntents
import Foundation
import UIKit

enum TimepleteSiriKeys {
  static let item = "timeplete.siri.addItem"
  static let list = "timeplete.siri.addList"
}

enum TimepleteAddToList {
  @MainActor
  static func enqueue(item: String, list: String = "grocery") async throws -> String {
    let trimmed = item.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw TimepleteAddToListError.emptyItem
    }

    UserDefaults.standard.set(trimmed, forKey: TimepleteSiriKeys.item)
    UserDefaults.standard.set(list, forKey: TimepleteSiriKeys.list)

    var comps = URLComponents()
    comps.scheme = "timeplete"
    comps.host = "add-to-list"
    comps.queryItems = [
      URLQueryItem(name: "item", value: trimmed),
      URLQueryItem(name: "list", value: list),
    ]
    if let url = comps.url {
      for _ in 0 ..< 15 {
        if UIApplication.shared.applicationState != .inactive { break }
        try await Task.sleep(nanoseconds: 100_000_000)
      }
      await UIApplication.shared.open(url)
    }
    return trimmed
  }
}

enum TimepleteAddToListError: Error {
  case emptyItem
}

@available(iOS 16.0, *)
struct GroceryItemEntity: AppEntity {
  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Grocery Item")
  static var defaultQuery = GroceryItemQuery()

  var id: String
  var name: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

@available(iOS 16.0, *)
struct GroceryItemQuery: EntityStringQuery {
  func entities(for identifiers: [GroceryItemEntity.ID]) async throws -> [GroceryItemEntity] {
    identifiers
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .map { GroceryItemEntity(id: $0, name: $0) }
  }

  func entities(matching string: String) async throws -> [GroceryItemEntity] {
    let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return [] }
    return [GroceryItemEntity(id: trimmed, name: trimmed)]
  }

  func suggestedEntities() async throws -> [GroceryItemEntity] {
    []
  }
}

/// Siri App Shortcut. Item must be an AppEntity so phrases can interpolate it.
@available(iOS 16.0, *)
struct AddToGroceryListIntent: AppIntent {
  static var title: LocalizedStringResource = "Add to Timeplete Grocery List"
  static var description = IntentDescription(
    "Adds an item to your Timeplete grocery list.",
    categoryName: "Timeplete",
    searchKeywords: ["timeplete", "grocery", "groceries", "list"],
  )
  static var openAppWhenRun: Bool = true
  static var isDiscoverable: Bool = true

  @Parameter(title: "Item", description: "What to add to the grocery list")
  var item: GroceryItemEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Add \(\.$item) to grocery list")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let trimmed = try await TimepleteAddToList.enqueue(item: item.name)
    return .result(dialog: "Adding \(trimmed) to your grocery list.")
  }
}

/// Shortcuts-friendly action with a typed text field (Ask Each Time).
@available(iOS 16.0, *)
struct AddGroceryItemIntent: AppIntent {
  static var title: LocalizedStringResource = "Add Grocery Item in Timeplete"
  static var description = IntentDescription(
    "Adds a typed item to your Timeplete grocery list.",
    categoryName: "Timeplete",
    searchKeywords: ["timeplete", "grocery", "groceries", "list"],
  )
  static var openAppWhenRun: Bool = true
  static var isDiscoverable: Bool = true

  @Parameter(title: "Item", description: "What to add to the grocery list")
  var item: String

  static var parameterSummary: some ParameterSummary {
    Summary("Add \(\.$item) to grocery list")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let trimmed = try await TimepleteAddToList.enqueue(item: item)
    return .result(dialog: "Adding \(trimmed) to your grocery list.")
  }
}

@available(iOS 16.0, *)
struct TimepleteShortcuts: AppShortcutsProvider {
  static var shortcutTileColor: ShortcutTileColor = .teal

  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddToGroceryListIntent(),
      phrases: [
        "Add \(\.$item) to my grocery list in \(.applicationName)",
        "Add \(\.$item) to grocery list in \(.applicationName)",
        "Add \(\.$item) to my groceries in \(.applicationName)",
        "\(.applicationName) add \(\.$item) to my grocery list",
      ],
      shortTitle: "Add to Grocery List",
      systemImageName: "cart"
    )
  }
}

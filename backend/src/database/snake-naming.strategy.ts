import {
  DefaultNamingStrategy,
  NamingStrategyInterface,
  Table,
} from 'typeorm';
import { snakeCase } from 'typeorm/util/StringUtils';

/**
 * snake_case naming strategy for PostgreSQL, matching the manually authored
 * migration columns. TypeORM removed its built-in SnakeNamingStrategy in
 * recent 0.3.x releases, so we provide a minimal one here.
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ?? snakeCase(targetName);
  }

  columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    return snakeCase(embeddedPrefixes.join('_')) + (customName ?? snakeCase(propertyName));
  }

  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(relationName + '_' + referencedColumnName);
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(tableName + '_' + (columnName ?? propertyName));
  }

  joinTableInverseColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return this.joinTableColumnName(tableName, propertyName, columnName);
  }

  primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    const table = this.extractTableName(tableOrName);
    return `PK_${table}_${columnNames.map((c) => snakeCase(c)).join('_')}`;
  }

  uniqueConstraintName(
    tableOrName: Table | string,
    columnNames: string[],
  ): string {
    const table = this.extractTableName(tableOrName);
    return `UQ_${table}_${columnNames.map((c) => snakeCase(c)).join('_')}`;
  }

  relationConstraintName(
    tableOrName: Table | string,
    columnNames: string[],
    where?: string,
  ): string {
    const table = this.extractTableName(tableOrName);
    return `REL_${table}_${columnNames.map((c) => snakeCase(c)).join('_')}${
      where ? `_${where}` : ''
    }`;
  }

  foreignKeyName(
    tableOrName: Table | string,
    columnNames: string[],
    referencedTablePath?: string,
    _referencedColumnNames?: string[],
  ): string {
    const table = this.extractTableName(tableOrName);
    const referencedTable = referencedTablePath
      ? this.extractTableName(referencedTablePath)
      : '';
    return `FK_${table}_${referencedTable}_${columnNames
      .map((c) => snakeCase(c))
      .join('_')}`;
  }

  indexName(
    tableOrName: Table | string,
    columnNames: string[],
    where?: string,
  ): string {
    const table = this.extractTableName(tableOrName);
    return `IDX_${table}_${columnNames.map((c) => snakeCase(c)).join('_')}${
      where ? `_${where}` : ''
    }`;
  }

  defaultConstraintName(
    tableOrName: Table | string,
    columnName: string,
  ): string {
    const table = this.extractTableName(tableOrName);
    return `DF_${table}_${snakeCase(columnName)}`;
  }

  private extractTableName(tableOrName: Table | string): string {
    return typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
  }
}

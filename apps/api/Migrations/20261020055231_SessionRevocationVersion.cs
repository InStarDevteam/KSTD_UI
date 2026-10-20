using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kstd.Api.Migrations
{
    /// <inheritdoc />
    public partial class SessionRevocationVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SessionVersion",
                table: "fc_Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SessionVersion",
                table: "fc_Users");
        }
    }
}

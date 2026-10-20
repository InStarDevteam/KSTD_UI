using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kstd.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "fc_AuditEvents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ActorId = table.Column<int>(type: "INTEGER", nullable: true),
                    Action = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Target = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Success = table.Column<bool>(type: "INTEGER", nullable: false),
                    TraceId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fc_AuditEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "fc_Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Email = table.Column<string>(type: "TEXT", maxLength: 254, nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: false),
                    FailedAttempts = table.Column<int>(type: "INTEGER", nullable: false),
                    LockedUntil = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fc_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "fc_Requests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 5000, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    OwnerId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fc_Requests", x => x.Id);
                    table.CheckConstraint("CK_Request_Category", "Category IN ('general','access','software','other')");
                    table.CheckConstraint("CK_Request_Status", "Status IN ('submitted','in_progress','completed','rejected')");
                    table.ForeignKey(
                        name: "FK_fc_Requests_fc_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "fc_Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "fc_Attachments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RequestId = table.Column<int>(type: "INTEGER", nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    StorageName = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Size = table.Column<long>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fc_Attachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_fc_Attachments_fc_Requests_RequestId",
                        column: x => x.RequestId,
                        principalTable: "fc_Requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "fc_RequestHistories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RequestId = table.Column<int>(type: "INTEGER", nullable: false),
                    ActorId = table.Column<int>(type: "INTEGER", nullable: false),
                    Action = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    FromStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    ToStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    Reason = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fc_RequestHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_fc_RequestHistories_fc_Requests_RequestId",
                        column: x => x.RequestId,
                        principalTable: "fc_Requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_fc_RequestHistories_fc_Users_ActorId",
                        column: x => x.ActorId,
                        principalTable: "fc_Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_fc_Attachments_RequestId",
                table: "fc_Attachments",
                column: "RequestId");

            migrationBuilder.CreateIndex(
                name: "IX_fc_Attachments_StorageName",
                table: "fc_Attachments",
                column: "StorageName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_fc_RequestHistories_ActorId",
                table: "fc_RequestHistories",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_fc_RequestHistories_RequestId",
                table: "fc_RequestHistories",
                column: "RequestId");

            migrationBuilder.CreateIndex(
                name: "IX_fc_Requests_OwnerId_CreatedAt",
                table: "fc_Requests",
                columns: new[] { "OwnerId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_fc_Users_Email",
                table: "fc_Users",
                column: "Email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "fc_Attachments");

            migrationBuilder.DropTable(
                name: "fc_AuditEvents");

            migrationBuilder.DropTable(
                name: "fc_RequestHistories");

            migrationBuilder.DropTable(
                name: "fc_Requests");

            migrationBuilder.DropTable(
                name: "fc_Users");
        }
    }
}

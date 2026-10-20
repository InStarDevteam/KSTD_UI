using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kstd.Api.Migrations
{
    /// <inheritdoc />
    public partial class SubmissionIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SubmissionKey",
                table: "fc_Requests",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_fc_Requests_OwnerId_SubmissionKey",
                table: "fc_Requests",
                columns: new[] { "OwnerId", "SubmissionKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_fc_Requests_OwnerId_SubmissionKey",
                table: "fc_Requests");

            migrationBuilder.DropColumn(
                name: "SubmissionKey",
                table: "fc_Requests");
        }
    }
}

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Kstd.Api;

public sealed class AppUser
{
    public int Id { get; set; }
    [MaxLength(254)] public required string Email { get; set; }
    [MaxLength(80)] public required string DisplayName { get; set; }
    [MaxLength(16)] public required string Role { get; set; }
    public required string PasswordHash { get; set; }
    public int SessionVersion { get; set; }
    public int FailedAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
}

public sealed class WorkRequest
{
    public int Id { get; set; }
    [MaxLength(100)] public required string Title { get; set; }
    [MaxLength(20)] public required string Category { get; set; }
    [MaxLength(5000)] public required string Description { get; set; }
    [MaxLength(20)] public string Status { get; set; } = "submitted";
    public int OwnerId { get; set; }
    public AppUser Owner { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [ConcurrencyCheck] public int Version { get; set; } = 1;
    [MaxLength(64)] public string? SubmissionKey { get; set; }
    public List<Attachment> Attachments { get; set; } = [];
    public List<RequestHistory> Histories { get; set; } = [];
}

public sealed class Attachment
{
    public int Id { get; set; }
    public int RequestId { get; set; }
    public WorkRequest Request { get; set; } = null!;
    [MaxLength(160)] public required string FileName { get; set; }
    [MaxLength(80)] public required string StorageName { get; set; }
    [MaxLength(80)] public required string ContentType { get; set; }
    public long Size { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class RequestHistory
{
    public int Id { get; set; }
    public int RequestId { get; set; }
    public WorkRequest Request { get; set; } = null!;
    public int ActorId { get; set; }
    public AppUser Actor { get; set; } = null!;
    [MaxLength(40)] public required string Action { get; set; }
    [MaxLength(20)] public string? FromStatus { get; set; }
    [MaxLength(20)] public string? ToStatus { get; set; }
    [MaxLength(500)] public required string Reason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class AuditEvent
{
    public int Id { get; set; }
    public int? ActorId { get; set; }
    [MaxLength(40)] public required string Action { get; set; }
    [MaxLength(100)] public required string Target { get; set; }
    public bool Success { get; set; }
    [MaxLength(80)] public required string TraceId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<WorkRequest> Requests => Set<WorkRequest>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<RequestHistory> Histories => Set<RequestHistory>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>().ToTable("fc_Users").HasIndex(user => user.Email).IsUnique();
        modelBuilder.Entity<WorkRequest>().ToTable("fc_Requests", table =>
        {
            table.HasCheckConstraint("CK_Request_Status", "Status IN ('submitted','in_progress','completed','rejected')");
            table.HasCheckConstraint("CK_Request_Category", "Category IN ('general','access','software','other')");
        });
        modelBuilder.Entity<WorkRequest>().HasOne(request => request.Owner).WithMany().HasForeignKey(request => request.OwnerId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<WorkRequest>().HasIndex(request => new { request.OwnerId, request.CreatedAt });
        modelBuilder.Entity<WorkRequest>().HasIndex(request => new { request.OwnerId, request.SubmissionKey }).IsUnique();
        modelBuilder.Entity<Attachment>().ToTable("fc_Attachments").HasIndex(file => file.StorageName).IsUnique();
        modelBuilder.Entity<Attachment>().HasOne(file => file.Request).WithMany(request => request.Attachments).HasForeignKey(file => file.RequestId);
        modelBuilder.Entity<RequestHistory>().ToTable("fc_RequestHistories");
        modelBuilder.Entity<RequestHistory>().HasOne(history => history.Request).WithMany(request => request.Histories).HasForeignKey(history => history.RequestId);
        modelBuilder.Entity<RequestHistory>().HasOne(history => history.Actor).WithMany().HasForeignKey(history => history.ActorId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<AuditEvent>().ToTable("fc_AuditEvents");
    }
}

// DTOs deliberately expose only fields the caller may modify; owner/status never bind from a request body.
public sealed record LoginDto(string? Email, string? Password);
public sealed record RequestDto(string? Title, string? Category, string? Description);
public sealed record UpdateRequestDto(string? Title, string? Category, string? Description, int Version);
public sealed record StatusDto(string? Status, string? Reason, int Version);
